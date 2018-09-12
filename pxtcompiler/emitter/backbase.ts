namespace ts.pxtc {

    // supporting multiple sizes (byte, short, int, long)
    export interface BitSizeInfo {
        size: number;
        needsSignExt?: boolean;
        immLimit: number;
    }


    export function asmStringLiteral(s: string) {
        let r = "\""
        for (let i = 0; i < s.length; ++i) {
            // TODO generate warning when seeing high character ?
            let c = s.charCodeAt(i) & 0xff
            let cc = String.fromCharCode(c)
            if (cc == "\\" || cc == "\"")
                r += "\\" + cc
            else if (cc == "\n")
                r += "\\n"
            else if (c <= 0xf)
                r += "\\x0" + c.toString(16)
            else if (c < 32 || c > 127)
                r += "\\x" + c.toString(16)
            else
                r += cc;
        }
        return r + "\""
    }

    // this class defines the interface between the IR
    // and a particular assembler (Thumb, AVR). Thus,
    // the registers mentioned below are VIRTUAL registers
    // required by the IR-machine, rather than PHYSICAL registers
    // at the assembly level.

    // that said, the assumptions below about registers are based on
    // ARM, so a mapping will be needed for other processors

    // Assumptions:
    // - registers can hold a pointer (data or code)
    // - special registers include: sp
    // - fixed registers are r0, r1, r2, r3, r5, r6 
    //   - r0 is the current value (from expression evaluation)
    //   - registers for runtime calls (r0, r1,r2,r3)
    //   - r5 is for captured locals in lambda
    //   - r6 for global{}
    // - for calls to user functions, all arguments passed on stack

    export abstract class AssemblerSnippets {
        nop() { return "TBD(nop)" }
        reg_gets_imm(reg: string, imm: number) { return "TBD(reg_gets_imm)" }
        // Registers are stored on the stack in numerical order 
        proc_setup(numlocals: number, main?: boolean) { return "TBD(proc_setup)" }
        push_fixed(reg: string[]) { return "TBD(push_fixed)" }
        push_local(reg: string) { return "TBD(push_local)" }
        push_locals(n: number) { return "TBD(push_locals)" }
        pop_fixed(reg: string[]) { return "TBD(pop_fixed)" }
        pop_locals(n: number) { return "TBD(pop_locals)" }
        proc_return() { return "TBD(proc_return)" }
        debugger_stmt(lbl: string) { return "" }
        debugger_bkpt(lbl: string) { return "" }
        debugger_proc(lbl: string) { return "" }
        unconditional_branch(lbl: string) { return "TBD(unconditional_branch)" }
        beq(lbl: string) { return "TBD(beq)" }
        bne(lbl: string) { return "TBD(bne)" }
        cmp(reg1: string, reg: string) { return "TBD(cmp)" }
        cmp_zero(reg1: string) { return "TBD(cmp_zero)" }
        arithmetic() { return "" }
        // load_reg_src_off is load/store indirect
        // word? - does offset represent an index that must be multiplied by word size?
        // inf?  - control over size of referenced data
        // str?  - true=Store/false=Load
        // src - can range over
        load_reg_src_off(reg: string, src: string, off: string, word?: boolean,
            store?: boolean, inf?: BitSizeInfo) {
            return "TBD(load_reg_src_off)";
        }
        rt_call(name: string, r0: string, r1: string) { return "TBD(rt_call)"; }
        call_lbl(lbl: string) { return "TBD(call_lbl)" }
        call_reg(reg: string) { return "TBD(call_reg)" }
        vcall(mapMethod: string, isSet: boolean, vtableShift: number) {
            return "TBD(vcall)"
        }
        prologue_vtable(arg_index: number, vtableShift: number) {
            return "TBD(prologue_vtable"
        }
        helper_prologue() { return "TBD(lambda_prologue)" }
        helper_epilogue() { return "TBD(lambda_epilogue)" }
        pop_clean(pops: boolean[]) { return "TBD" }
        load_ptr(lbl: string, reg: string) { return "TBD(load_ptr)" }
        load_ptr_full(lbl: string, reg: string) { return "TBD(load_ptr_full)" }
        emit_int(v: number, reg: string) { return "TBD(emit_int)" }

        string_literal(lbl: string, s: string) {
            return `
.balign 4
${lbl}meta: .short 0xffff, ${pxt.REF_TAG_STRING}, ${s.length}
${lbl}: .string ${asmStringLiteral(s)}
`
        }


        hex_literal(lbl: string, data: string) {
            return `
.balign 4
${lbl}: .short 0xffff, ${pxt.REF_TAG_BUFFER}, ${data.length >> 1}, 0x0000
        .hex ${data}${data.length % 4 == 0 ? "" : "00"}
`
        }

        method_call(procid: ir.ProcId, topExpr: ir.Expr) {
            return ""
        }
    }

    // helper for emit_int
    export function numBytes(n: number) {
        let v = 0
        for (let q = n; q > 0; q >>>= 8) {
            v++
        }
        return v || 1
    }

    export class ProctoAssembler {

        private t: ThumbSnippets; // for better "Go To Definition"
        private bin: Binary;
        private resText = ""
        private exprStack: ir.Expr[] = []
        private calls: ProcCallInfo[] = []
        private proc: ir.Procedure = null;
        private baseStackSize = 0; // real stack size is this + exprStack.length

        constructor(t: AssemblerSnippets, bin: Binary, proc: ir.Procedure) {
            this.t = t as any; // TODO in future, figure out if we follow the "Snippets" architecture
            this.bin = bin;
            this.proc = proc;
            this.work();
        }

        private write = (s: string) => { this.resText += asmline(s); }

        private redirectOutput(f: () => void) {
            let prevWrite = this.write
            let res = ""
            this.write = s => res += asmline(s)
            try {
                f()
            } finally {
                this.write = prevWrite
            }
            return res
        }

        private stackSize() {
            return this.baseStackSize + this.exprStack.length
        }

        private stackAlignmentNeeded(offset = 0) {
            if (!target.stackAlign) return 0
            let npush = target.stackAlign - ((this.stackSize() + offset) & (target.stackAlign - 1))
            if (npush == target.stackAlign) return 0
            else return npush
        }

        private alignStack(offset = 0) {
            let npush = this.stackAlignmentNeeded(offset)
            if (!npush) return ""
            this.write(this.t.push_locals(npush))
            return this.t.pop_locals(npush)
        }

        public getAssembly() {
            return this.resText;
        }

        private work() {
            let name = this.proc.getName()
            if (assembler.debug && this.proc.action) {
                let info = ts.pxtc.nodeLocationInfo(this.proc.action)
                name += " " + info.fileName + ":" + (info.line + 1)
            }
            this.write(`
;
; Function ${name}
;
`)

            if (this.proc.args.length <= 3)
                this.emitLambdaWrapper(this.proc.isRoot)

            let baseLabel = this.proc.label()
            let bkptLabel = baseLabel + "_bkpt"
            let locLabel = baseLabel + "_locals"
            let endLabel = baseLabel + "_end"
            this.write(`.section code`)
            this.write(`
${baseLabel}:
    @stackmark func
    @stackmark args
`)
            // create a new function for later use by hex file generation
            this.proc.fillDebugInfo = th => {
                let labels = th.getLabels()

                this.proc.debugInfo = {
                    locals: (this.proc.seqNo == 1 ? this.bin.globals : this.proc.locals).map(l => l.getDebugInfo()),
                    args: this.proc.args.map(l => l.getDebugInfo()),
                    name: this.proc.getName(),
                    codeStartLoc: U.lookup(labels, locLabel),
                    codeEndLoc: U.lookup(labels, endLabel),
                    bkptLoc: U.lookup(labels, bkptLabel),
                    localsMark: U.lookup(th.stackAtLabel, locLabel),
                    idx: this.proc.seqNo,
                    calls: this.calls
                }

                for (let ci of this.calls) {
                    ci.addr = U.lookup(labels, ci.callLabel)
                    ci.stack = U.lookup(th.stackAtLabel, ci.callLabel)
                    ci.callLabel = undefined // don't waste space
                }

                for (let i = 0; i < this.proc.body.length; ++i) {
                    let bi = this.proc.body[i].breakpointInfo
                    if (bi) {
                        let off = U.lookup(th.stackAtLabel, `__brkp_${bi.id}`)
                        if (off !== this.proc.debugInfo.localsMark) {
                            console.log(bi)
                            console.log(th.stackAtLabel)
                            U.oops(`offset doesn't match: ${off} != ${this.proc.debugInfo.localsMark}`)
                        }
                    }
                }
            }

            if (this.bin.options.breakpoints) {
                this.write(this.t.debugger_proc(bkptLabel))
            }
            this.baseStackSize = 1 // push {lr}
            let numlocals = this.proc.locals.length
            this.write(this.t.proc_setup(numlocals))
            this.baseStackSize += numlocals


            this.write("@stackmark locals")
            this.write(`${locLabel}:`)

            //console.log(proc.toString())
            this.proc.resolve()
            //console.log("OPT", proc.toString())

            for (let i = 0; i < this.proc.body.length; ++i) {
                let s = this.proc.body[i]
                // console.log("STMT", s.toString())
                switch (s.stmtKind) {
                    case ir.SK.Expr:
                        this.emitExpr(s.expr)
                        break;
                    case ir.SK.StackEmpty:
                        if (this.exprStack.length > 0) {
                            for (let stmt of this.proc.body.slice(i - 4, i + 1))
                                console.log(`PREVSTMT ${stmt.toString().trim()}`)
                            for (let e of this.exprStack)
                                console.log(`EXPRSTACK ${e.currUses}/${e.totalUses} E: ${e.toString()}`)
                            oops("stack should be empty")
                        }
                        this.write("@stackempty locals")
                        break;
                    case ir.SK.Jmp:
                        this.emitJmp(s);
                        break;
                    case ir.SK.Label:
                        this.write(s.lblName + ":")
                        this.validateJmpStack(s)
                        break;
                    case ir.SK.Breakpoint:
                        if (this.bin.options.breakpoints) {
                            let lbl = `__brkp_${s.breakpointInfo.id}`
                            if (s.breakpointInfo.isDebuggerStmt) {
                                this.write(this.t.debugger_stmt(lbl))
                            } else {
                                this.write(this.t.debugger_bkpt(lbl))
                            }
                        }
                        break;
                    default: oops();
                }
            }

            assert(0 <= numlocals && numlocals < 127);
            if (numlocals > 0)
                this.write(this.t.pop_locals(numlocals))
            this.write(`${endLabel}:`)
            this.write(this.t.proc_return())
            this.write("@stackempty func");
            this.write("@stackempty args")
        }

        private mkLbl(root: string) {
            let l = root + this.bin.lblNo++
            if (l[0] != "_") l = "." + l
            return l
        }

        private dumpStack() {
            let r = "["
            for (let s of this.exprStack) {
                r += s.sharingInfo() + ": " + s.toString() + "; "
            }
            r += "]"
            return r
        }

        private terminate(expr: ir.Expr) {
            assert(expr.exprKind == ir.EK.SharedRef)
            let arg = expr.args[0]
            // console.log("TERM", arg.sharingInfo(), arg.toString(), this.dumpStack())
            U.assert(arg.currUses != arg.totalUses)
            // we should have the terminated expression on top
            U.assert(this.exprStack[0] === arg, "term at top")
            // we pretend it's popped and simulate what clearStack would do
            let numEntries = 1
            while (numEntries < this.exprStack.length) {
                let ee = this.exprStack[numEntries]
                if (ee.currUses != ee.totalUses)
                    break
                numEntries++
            }
            // in this branch we just remove all that stuff off the stack
            this.write(`@dummystack ${numEntries}`)
            this.write(this.t.pop_locals(numEntries))

            return numEntries
        }

        private validateJmpStack(lbl: ir.Stmt, off = 0) {
            // console.log("Validate:", off, lbl.lblName, this.dumpStack())
            let currSize = this.exprStack.length - off
            if (lbl.lblStackSize == null) {
                lbl.lblStackSize = currSize
            } else {
                if (lbl.lblStackSize != currSize) {
                    console.log(lbl.lblStackSize, currSize)
                    console.log(this.dumpStack())
                    U.oops("stack misaligned at: " + lbl.lblName)
                }
            }
        }

        private emitJmp(jmp: ir.Stmt) {
            let termOff = 0
            if (jmp.jmpMode == ir.JmpMode.Always) {
                if (jmp.expr)
                    this.emitExpr(jmp.expr)
                if (jmp.terminateExpr)
                    termOff = this.terminate(jmp.terminateExpr)
                this.write(this.t.unconditional_branch(jmp.lblName) + " ; with expression")
            } else {
                let lbl = this.mkLbl("jmpz")

                if (jmp.jmpMode == ir.JmpMode.IfJmpValEq) {
                    this.emitExprInto(jmp.expr, "r1")
                    this.write(this.t.cmp("r0", "r1"))
                } else {
                    this.emitExpr(jmp.expr)

                    // TODO: remove ARM-specific code
                    if (jmp.expr.exprKind == ir.EK.RuntimeCall &&
                        (jmp.expr.data === "thumb::subs" || U.startsWith(jmp.expr.data, "_cmp_"))) {
                        // no cmp required
                    } else {
                        this.write(this.t.cmp_zero("r0"))
                    }
                }

                if (jmp.jmpMode == ir.JmpMode.IfNotZero) {
                    this.write(this.t.beq(lbl)) // this is to *skip* the following 'b' instruction; beq itself has a very short range
                } else {
                    // IfZero or IfJmpValEq
                    this.write(this.t.bne(lbl))
                }

                if (jmp.terminateExpr)
                    termOff = this.terminate(jmp.terminateExpr)

                this.write(this.t.unconditional_branch(jmp.lblName))
                this.write(lbl + ":")
            }

            this.validateJmpStack(jmp.lbl, termOff)
        }

        private clearStack(fast = false) {
            let numEntries = 0
            while (this.exprStack.length > 0 && this.exprStack[0].currUses == this.exprStack[0].totalUses) {
                numEntries++;
                this.exprStack.shift()
            }
            if (numEntries)
                this.write(this.t.pop_locals(numEntries))
            if (!fast) {
                let toClear = this.exprStack.filter(e => e.currUses == e.totalUses && e.irCurrUses != -1)
                if (toClear.length > 0) {
                    this.write(this.t.reg_gets_imm("r1", 0))
                    for (let a of toClear) {
                        a.irCurrUses = -1
                        this.write(this.loadFromExprStack("r1", a, 0, true))
                    }
                }
            }
        }

        private withRef(name: string, isRef: boolean) {
            return name + (isRef ? "Ref" : "")
        }

        private emitExprInto(e: ir.Expr, reg: string) {
            switch (e.exprKind) {
                case ir.EK.NumberLiteral:
                    if (e.data === true) this.write(this.t.emit_int(1, reg))
                    else if (e.data === false) this.write(this.t.emit_int(0, reg))
                    else if (e.data === null) this.write(this.t.emit_int(0, reg))
                    else if (typeof e.data == "number") this.write(this.t.emit_int(e.data, reg))
                    else oops();
                    break;
                case ir.EK.PointerLiteral:
                    if (e.args)
                        this.write(this.t.load_ptr_full(e.data, reg))
                    else
                        this.write(this.t.load_ptr(e.data, reg))
                    break;
                case ir.EK.SharedRef:
                    let arg = e.args[0]
                    U.assert(!!arg.currUses) // not first use
                    U.assert(arg.currUses < arg.totalUses)
                    arg.currUses++
                    let idx = this.exprStack.indexOf(arg)
                    U.assert(idx >= 0)
                    if (idx == 0 && arg.totalUses == arg.currUses) {
                        this.write(this.t.pop_fixed([reg]) + ` ; tmpref @${this.exprStack.length}`)
                        this.exprStack.shift()
                        this.clearStack()
                    } else {
                        let idx0 = idx.toString() + ":" + this.exprStack.length
                        this.write(this.t.load_reg_src_off(reg, "sp", idx0, true) + ` ; tmpref @${this.exprStack.length - idx}`)
                    }
                    break;
                case ir.EK.CellRef:
                    let cell = e.data as ir.Cell
                    if (cell.isGlobal()) {
                        let inf = this.bitSizeInfo(cell.bitSize)
                        let off = "#" + cell.index
                        if (inf.needsSignExt || cell.index >= inf.immLimit) {
                            this.write(this.t.emit_int(cell.index, reg))
                            off = reg
                        }
                        this.write(this.t.load_reg_src_off(reg, "r6", off, false, false, inf))
                    } else {
                        let [src, imm, idx] = this.cellref(cell)
                        this.write(this.t.load_reg_src_off(reg, src, imm, idx))
                    }
                    break;
                default: oops();
            }
        }

        private bitSizeInfo(b: BitSize) {
            let inf: BitSizeInfo = {
                size: sizeOfBitSize(b),
                immLimit: 128
            }
            if (inf.size == 1) {
                inf.immLimit = 32
            } else if (inf.size == 2) {
                inf.immLimit = 64
            }
            if (b == BitSize.Int8 || b == BitSize.Int16) {
                inf.needsSignExt = true
            }
            return inf
        }

        // result in R0
        private emitExpr(e: ir.Expr): void {
            //console.log(`EMITEXPR ${e.sharingInfo()} E: ${e.toString()}`)

            switch (e.exprKind) {
                case ir.EK.JmpValue:
                    this.write("; jmp value (already in r0)")
                    break;
                case ir.EK.Nop:
                    // this is there because we need different addresses for breakpoints
                    this.write(this.t.nop())
                    break;
                case ir.EK.Incr:
                    this.emitExpr(e.args[0])
                    this.emitCallRaw("pxt::incr")
                    break;
                case ir.EK.Decr:
                    this.emitExpr(e.args[0])
                    this.emitCallRaw("pxt::decr")
                    break;
                case ir.EK.FieldAccess:
                    let info = e.data as FieldAccessInfo
                    // it does the decr itself, no mask
                    return this.emitExpr(ir.rtcall(this.withRef("pxtrt::ldfld", info.isRef), [e.args[0], ir.numlit(info.idx)]))
                case ir.EK.Store:
                    return this.emitStore(e.args[0], e.args[1])
                case ir.EK.RuntimeCall:
                    return this.emitRtCall(e);
                case ir.EK.ProcCall:
                    return this.emitProcCall(e)
                case ir.EK.SharedDef:
                    return this.emitSharedDef(e)
                case ir.EK.Sequence:
                    e.args.forEach(e => this.emitExpr(e))
                    return this.clearStack()
                default:
                    return this.emitExprInto(e, "r0")
            }
        }

        private emitSharedDef(e: ir.Expr) {
            let arg = e.args[0]
            U.assert(arg.totalUses >= 1)
            U.assert(arg.currUses === 0)
            arg.currUses = 1
            if (arg.totalUses == 1)
                return this.emitExpr(arg)
            else {
                this.emitExpr(arg)
                this.exprStack.unshift(arg)
                this.write(this.t.push_local("r0") + "; tmpstore @" + this.exprStack.length)
            }
        }

        private clearArgs(nonRefs: ir.Expr[], refs: ir.Expr[]) {
            let numArgs = nonRefs.length + refs.length

            let allArgs = nonRefs.concat(refs)
            for (let r of allArgs) {
                if (r.currUses != 0 || r.totalUses != 1) {
                    console.log(r.toString())
                    console.log(allArgs.map(a => a.toString()))
                    U.oops(`wrong uses: ${r.currUses} ${r.totalUses}`)
                }
            }

            for (let r of nonRefs) {
                r.currUses = 1
            }

            if (refs.length == 0) {
                // no helper in that case
                this.clearStack()
                return
            }

            const s0 = this.exprStack.length
            const decr = this.redirectOutput(() => {
                this.write(this.t.mov("r7", "r0"))
                this.write(this.t.mov("r4", "lr"))
                let k = 0
                while (refs.length > 0) {
                    this.clearStack(true)
                    let s0 = this.exprStack[0]
                    let idx = refs.indexOf(s0)
                    if (idx >= 0) {
                        this.exprStack.shift()
                        refs.splice(idx, 1)
                        this.write(this.t.pop_fixed(["r0"]))
                        this.write(this.t.inline_decr(k++, this.stackSize()))
                    } else {
                        break
                    }
                }
                while (refs.length > 0) {
                    let r = refs.shift()
                    r.currUses = 1
                    this.write(this.loadFromExprStack("r0", r))
                    this.write(this.t.inline_decr(k++, this.stackSize()))
                }
                this.clearStack()
                this.write(this.t.mov("r0", "r7"))
                this.write(this.t.helper_ret())
            })
            const numPops = s0 - this.exprStack.length

            this.emitHelper(`@dummystack ${numPops}\n` + decr, "clr" + numArgs)
            this.write(`@dummystack ${-numPops}`)
        }

        private emitRtCall(topExpr: ir.Expr) {
            let name: string = topExpr.data
            
            let maskInfo = topExpr.mask || { refMask: 0 }
            let convs = maskInfo.conversions || []
            let allArgs = topExpr.args.map((a, i) => ({
                idx: i,
                expr: a,
                isSimple: a.isLiteral(),
                isRef: (maskInfo.refMask & (1 << i)) != 0,
                conv: convs.find(c => c.argIdx == i)
            }))

            U.assert(allArgs.length <= 4)

            let seenUpdate = false
            for (let a of U.reversed(allArgs)) {
                if (a.expr.isPure()) {
                    if (!a.isSimple && !a.isRef)
                        if (!seenUpdate || a.expr.isStateless())
                            a.isSimple = true
                } else {
                    seenUpdate = true
                }
            }

            for (let a of allArgs) {
                // we might want conversion from literal numbers to strings for example
                if (a.conv) a.isSimple = false
            }

            let complexArgs = allArgs.filter(a => !a.isSimple)

            if (complexArgs.every(c => c.expr.isPure() && !c.isRef && !c.conv)) {
                for (let c of complexArgs) c.isSimple = true
                complexArgs = []
            }

            let c0 = complexArgs[0]
            let clearStack = true

            if (complexArgs.length == 1 && !c0.conv && !c0.isRef) {
                this.emitExpr(c0.expr)
                if (c0.idx != 0)
                    this.write(this.t.mov("r" + c0.idx, "r0"))
                clearStack = false
            } else {
                for (let a of complexArgs)
                    this.pushArg(a.expr)

                this.alignExprStack(0)

                let convArgs = complexArgs.filter(a => !!a.conv)
                if (convArgs.length) {
                    const conv = this.redirectOutput(() => {
                        let off = 0
                        if (this.t.stackAligned())
                            off += 2
                        else
                            off += 1
                        for (let a of convArgs) {
                            this.write(this.loadFromExprStack("r0", a.expr, off))
                            this.alignedCall(a.conv.method, "", off)
                            if (a.conv.returnsRef)
                                // replace the entry on the stack with the return value,
                                // as the original was already decr'ed, but the result
                                // has yet to be
                                this.write(this.loadFromExprStack("r0", a.expr, off, true))
                            this.write(this.t.push_fixed(["r0"]))
                            off++
                        }
                        for (let a of U.reversed(convArgs)) {
                            off--
                            this.write(this.t.pop_fixed(["r" + a.idx]))
                        }
                        for (let a of complexArgs) {
                            if (!a.conv)
                                this.write(this.loadFromExprStack("r" + a.idx, a.expr, off))
                        }
                    })
                    this.emitHelper(this.t.helper_prologue() + conv + this.t.helper_epilogue(), "conv")
                } else {
                    // not really worth a helper; some of this will be peep-holed away
                    for (let a of complexArgs)
                        this.write(this.loadFromExprStack("r" + a.idx, a.expr))
                }
            }

            for (let a of allArgs)
                if (a.isSimple)
                    this.emitExprInto(a.expr, "r" + a.idx)


            if (name != "langsupp::ignore")
                this.alignedCall(name)

            if (clearStack) {
                this.clearArgs(complexArgs.filter(a => !a.isRef).map(a => a.expr),
                    complexArgs.filter(a => a.isRef).map(a => a.expr))
            }
        }

        private alignedCall(name: string, cmt = "", off = 0) {
            let unalign = this.alignStack(off)
            this.write(this.t.call_lbl(name) + cmt)
            this.write(unalign)
        }

        private emitHelper(asm: string, baseName = "hlp") {
            if (!this.bin.codeHelpers[asm]) {
                let len = Object.keys(this.bin.codeHelpers).length
                this.bin.codeHelpers[asm] = `_${baseName}_${len}`
            }
            this.write(this.t.call_lbl(this.bin.codeHelpers[asm]))
        }

        private pushToExprStack(a: ir.Expr) {
            a.totalUses = 1
            a.currUses = 0
            this.exprStack.unshift(a)
        }

        private pushArg(a: ir.Expr) {
            this.clearStack(true)
            let bot = this.exprStack.length
            this.emitExpr(a)
            this.clearStack(true)
            this.write(this.t.push_local("r0") + " ; proc-arg")
            this.pushToExprStack(a)
        }

        private loadFromExprStack(r: string, a: ir.Expr, off = 0, store = false) {
            let idx = this.exprStack.indexOf(a)
            assert(idx >= 0)
            return this.t.load_reg_src_off(r, "sp", (idx + off).toString(), true, store) + ` ; estack\n`
        }

        private pushDummy() {
            let dummy = ir.numlit(0)
            dummy.totalUses = 1
            dummy.currUses = 1
            this.exprStack.unshift(dummy)
        }

        private alignExprStack(numargs: number) {
            let interAlign = this.stackAlignmentNeeded(numargs)
            if (interAlign) {
                this.write(this.t.push_locals(interAlign))
                for (let i = 0; i < interAlign; ++i)
                    this.pushDummy()
            }
        }

        private emitProcCall(topExpr: ir.Expr) {
            let complexArgs: ir.Expr[] = []
            let theOne: ir.Expr = null
            let theOneReg = ""

            let seenUpdate = false
            for (let c of U.reversed(topExpr.args)) {
                if (c.isPure()) {
                    if (!seenUpdate || c.isStateless())
                        continue
                } else {
                    seenUpdate = true
                }
                complexArgs.push(c)
            }
            complexArgs.reverse()

            if (complexArgs.length <= 1) {
                // in case there is at most one complex argument, we don't need to re-push anything
                let a0 = complexArgs[0]
                if (a0) {
                    theOne = a0
                    this.clearStack(true)
                    this.emitExpr(a0)
                    if (a0 == topExpr.args[topExpr.args.length - 1])
                        theOneReg = "r0"
                    else {
                        theOneReg = "r3"
                        this.write(this.t.mov("r3", "r0"))
                    }
                }
                complexArgs = []
            } else {
                for (let a of complexArgs)
                    this.pushArg(a)
            }

            this.alignExprStack(topExpr.args.length)
            // available registers
            let regList = ["r1", "r2", "r3", "r4", "r7"]
            let regExprs: ir.Expr[] = []

            if (complexArgs.length) {
                let maxDepth = -1
                for (let c of complexArgs) {
                    maxDepth = Math.max(this.exprStack.indexOf(c), maxDepth)
                }
                maxDepth++
                // we have 6 registers to play with
                if (maxDepth <= regList.length) {
                    regList = regList.slice(0, maxDepth)
                    this.write(this.t.pop_fixed(regList))
                    regExprs = this.exprStack.splice(0, maxDepth)

                    // now push anything that isn't an argument
                    let pushList: string[] = []
                    for (let i = maxDepth - 1; i >= 0; --i) {
                        if (complexArgs.indexOf(regExprs[i]) < 0) {
                            pushList.push(regList[i])
                            this.exprStack.unshift(regExprs[i])
                        }
                    }
                    if (pushList.length)
                        this.write(this.t.push_fixed(pushList))
                } else {
                    regList = null
                    this.write(this.t.reg_gets_imm("r7", 0))
                }
            }

            for (let a of U.reversed(topExpr.args)) {
                if (complexArgs.indexOf(a) >= 0) {
                    if (regList) {
                        this.write(this.t.push_fixed([regList[regExprs.indexOf(a)]]))
                    } else {
                        this.write(this.loadFromExprStack("r0", a))
                        this.write(this.t.push_local("r0") + " ; re-push")
                        this.write(this.loadFromExprStack("r7", a, 1, true))
                        let idx = this.exprStack.indexOf(a)
                        let theNull = ir.numlit(0)
                        theNull.currUses = 1
                        theNull.totalUses = 1
                        this.exprStack[idx] = theNull
                    }
                    this.exprStack.unshift(a)
                } else if (a === theOne) {
                    this.write(this.t.push_local(theOneReg) + " ; the one arg")
                    this.pushToExprStack(a)
                } else {
                    this.pushArg(a)
                }
            }

            let lbl = this.mkLbl("_proccall")

            let procid = topExpr.data as ir.ProcId
            let procIdx = -1
            if (procid.virtualIndex != null || procid.ifaceIndex != null) {
                let custom = this.t.method_call(procid, topExpr)
                if (custom) {
                    this.write(custom)
                    this.write(lbl + ":")
                } else if (procid.mapMethod) {
                    let isSet = /Set/.test(procid.mapMethod)
                    assert(isSet == (topExpr.args.length == 2))
                    assert(!isSet == (topExpr.args.length == 1))
                    this.write(this.t.emit_int(procid.mapIdx, "r1"))
                    if (isSet)
                        this.write(this.t.emit_int(procid.ifaceIndex, "r2"))
                    this.emitHelper(this.t.vcall(procid.mapMethod, isSet, this.bin.options.target.vtableShift), "vcall")
                    this.write(lbl + ":")
                } else {
                    this.write(this.t.prologue_vtable(0, this.bin.options.target.vtableShift))

                    let effIdx = procid.virtualIndex + numSpecialMethods + 2
                    if (procid.ifaceIndex != null) {
                        this.write(this.t.load_reg_src_off("r0", "r0", "#4") + " ; iface table")
                        effIdx = procid.ifaceIndex
                    }
                    if (effIdx <= 31) {
                        this.write(this.t.load_reg_src_off("r0", "r0", effIdx.toString(), true) + " ; ld-method")
                    } else {
                        this.write(this.t.emit_int(effIdx * 4, "r1"))
                        this.write(this.t.load_reg_src_off("r0", "r0", "r1") + " ; ld-method")
                    }

                    this.write(this.t.call_reg("r0"))
                    this.write(lbl + ":")
                }
            } else {
                let proc = procid.proc
                procIdx = proc.seqNo
                this.write(this.t.call_lbl(proc.label()))
                this.write(lbl + ":")
            }
            this.calls.push({
                procIndex: procIdx,
                stack: 0,
                addr: 0,
                callLabel: lbl,
            })

            // note that we have to treat all arguments as refs,
            // because the procedure might have overriden them and we need to unref them
            this.clearArgs([], topExpr.args)
        }

        private emitStore(trg: ir.Expr, src: ir.Expr) {
            switch (trg.exprKind) {
                case ir.EK.CellRef:
                    let cell = trg.data as ir.Cell
                    this.emitExpr(src)
                    if (cell.isGlobal()) {
                        let inf = this.bitSizeInfo(cell.bitSize)
                        let off = "#" + cell.index
                        if (cell.index >= inf.immLimit) {
                            this.write(this.t.emit_int(cell.index, "r1"))
                            off = "r1"
                        }
                        this.write(this.t.load_reg_src_off("r0", "r6", off, false, true, inf))
                    } else {
                        let [reg, imm, off] = this.cellref(cell)
                        this.write(this.t.load_reg_src_off("r0", reg, imm, off, true))
                    }
                    break;
                case ir.EK.FieldAccess:
                    let info = trg.data as FieldAccessInfo
                    // it does the decr itself, no mask
                    this.emitExpr(ir.rtcall(this.withRef("pxtrt::stfld", info.isRef), [trg.args[0], ir.numlit(info.idx), src]))
                    break;
                default: oops();
            }
        }

        private cellref(cell: ir.Cell): [string, string, boolean] {
            if (cell.isGlobal()) {
                throw oops()
            } else if (cell.iscap) {
                assert(0 <= cell.index && cell.index < 32)
                return ["r5", cell.index.toString(), true]
            } else if (cell.isarg) {
                let idx = cell.index
                return ["sp", "args@" + idx.toString() + ":" + this.baseStackSize, false]
            } else {
                return ["sp", "locals@" + cell.index, false]
            }
        }

        private emitLambdaWrapper(isMain: boolean) {
            let node = this.proc.action
            this.write("")
            this.write(".section code");

            if (isMain)
                this.write(this.t.unconditional_branch(".themain"))
            this.write(".balign 4");
            this.write(this.proc.label() + "_Lit:");
            this.write(`.short 0xffff, ${pxt.REF_TAG_ACTION}   ; action literal`);
            if (isMain)
                this.write(".themain:")

            this.write("@stackmark litfunc");

            let parms = this.proc.args.map(a => a.def)
            let numpop = parms.length

            this.write(this.t.proc_setup(0, true))

            const setup = this.redirectOutput(() => {
                this.write(this.t.push_fixed(["r4", "r5", "r6", "r7"]))
                this.baseStackSize = 1 + 4

                let alignment = this.stackAlignmentNeeded(parms.length)
                if (alignment) {
                    this.write(this.t.push_locals(alignment))
                    numpop += alignment
                }

                parms.forEach((_, i) => {
                    if (i >= 3)
                        U.userError(U.lf("only up to three parameters supported in lambdas"))
                    this.write(this.t.push_local(`r${parms.length - i}`))
                })

                this.write(this.t.lambda_init())
            })

            let stackEntries = numpop + 4

            this.write(`@dummystack ${stackEntries}`)
            this.emitHelper(`${setup}\n@dummystack ${-stackEntries}`, "lambda_setup")
            this.write(this.t.call_lbl(this.proc.label()))

            if (numpop)
                this.write(this.t.pop_locals(numpop))
            this.write(this.t.pop_fixed(["r4", "r5", "r6", "r7", "pc"]))

            this.write("@stackempty litfunc");
        }

        private emitCallRaw(name: string) {
            let inf = hex.lookupFunc(name)
            assert(!!inf, "unimplemented raw function: " + name)
            this.alignedCall(name)
        }
    }
}
