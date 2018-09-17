namespace pxtblockly {
    export interface GalleryItem {
        qName: string;
        src: string;
        alt: string;
    }

    const COLUMNS = 4;

    export class Gallery {
        protected info: pxtc.BlocksInfo;
        protected contentDiv: HTMLDivElement;
        protected containerDiv: HTMLDivElement;

        protected itemBorderColor: string;
        protected itemBackgroundColor: string;

        protected visible = false;

        protected pending: (res: Bitmap, err?: string) => void;

        constructor(info: pxtc.BlocksInfo) {
            this.info = info;

            this.containerDiv = document.createElement("div");
            this.containerDiv.setAttribute("id", "sprite-editor-gallery-outer");
            this.contentDiv = document.createElement("div");
            this.contentDiv.setAttribute("id", "sprite-editor-gallery");

            this.itemBackgroundColor = "#ffffff";
            this.itemBorderColor = "#000000";

            this.initStyles();
            this.containerDiv.appendChild(this.contentDiv);

            this.containerDiv.style.display = "none";
            this.contentDiv.addEventListener("animationend", () => {
                if (!this.visible) {
                    this.containerDiv.style.display = "none";
                }
            });
        }

        getElement() {
            return this.containerDiv;
        }

        show(cb: (res: Bitmap, err?: string) => void) {
            if (this.pending) {
                this.reject("Error: multiple calls");
            }
            this.pending = cb;

            this.containerDiv.style.display = "block";
            this.buildDom();
            this.visible = true;
            this.contentDiv.setAttribute("class", "shown");
        }

        hide() {
            if (this.pending) {
                this.reject("cancelled");
            }
            this.visible = false;
            this.contentDiv.setAttribute("class", "hidden-above");
        }

        layout(left: number, top: number, height: number) {
            this.containerDiv.style.left = left + "px";
            this.containerDiv.style.top = top + "px";
            this.containerDiv.style.height = height + "px";
        }

        protected buildDom() {
            pxsim.U.clear(this.contentDiv);
            const totalWidth = this.containerDiv.clientWidth - 17;
            const buttonWidth = (Math.floor(totalWidth / COLUMNS) - 8) + "px";
            this.getGalleryItems("Image").forEach((item, i) => this.mkButton(item.src, item.alt, item.qName, i, buttonWidth));
        }

        protected initStyles() {
            const style = document.createElement("style");
            style.textContent = `
            #sprite-editor-gallery {
                margin-top: -100%;
            }

            #sprite-editor-gallery.hidden-above {
                margin-top: -100%;
                animation: slide-up 0.2s 0s ease;
            }

            #sprite-editor-gallery.shown {
                margin-top: 0px;
                animation: slide-down 0.2s 0s ease;
            }

            @keyframes slide-down {
                0% {
                    margin-top: -100%;
                }
                100% {
                    margin-top: 0px;
                }
            }

            @keyframes slide-up {
                0% {
                    margin-top: 0px;
                }
                100% {
                    margin-top: -100%;
                }
            }
            `;
            this.containerDiv.appendChild(style);
        }

        protected mkButton(src: string, alt: string, value: string, i: number, width: string) {
            let button = document.createElement('button');
            button.setAttribute('id', ':' + i); // For aria-activedescendant
            button.setAttribute('role', 'menuitem');
            button.setAttribute('class', 'blocklyDropDownButton sprite-editor-card');
            button.title = alt;
            button.style.width = width;
            button.style.height = width;
            let backgroundColor = this.itemBackgroundColor;

            button.style.backgroundColor = backgroundColor;
            button.style.borderColor = this.itemBorderColor;
            Blockly.bindEvent_(button, 'click', this, () => this.handleSelection(value));
            Blockly.bindEvent_(button, 'mouseup', this, () => this.handleSelection(value));

            const parentDiv = this.contentDiv;

            // These are applied manually instead of using the :hover pseudoclass
            // because Android has a bad long press "helper" menu and green highlight
            // that we must prevent with ontouchstart preventDefault
            Blockly.bindEvent_(button, 'mousedown', button, function (e) {
                this.setAttribute('class', 'blocklyDropDownButton blocklyDropDownButtonHover sprite-editor-card');
                e.preventDefault();
            });
            Blockly.bindEvent_(button, 'mouseover', button, function () {
                this.setAttribute('class', 'blocklyDropDownButton blocklyDropDownButtonHover sprite-editor-card');
                parentDiv.setAttribute('aria-activedescendant', this.id);
            });
            Blockly.bindEvent_(button, 'mouseout', button, function () {
                this.setAttribute('class', 'blocklyDropDownButton sprite-editor-card');
                parentDiv.removeAttribute('aria-activedescendant');
            });

            let buttonImg = document.createElement('img');
            buttonImg.src = src;
            button.setAttribute('data-value', value);
            buttonImg.setAttribute('data-value', value);
            button.appendChild(buttonImg);
            this.contentDiv.appendChild(button);
        }

        protected resolve(bitmap: Bitmap) {
            if (this.pending) {
                const cb = this.pending;
                this.pending = undefined;
                cb(bitmap);
            }
        }

        protected reject(reason: string) {
            if (this.pending) {
                const cb = this.pending;
                this.pending = undefined;
                cb(undefined, reason);
            }
        }

        protected handleSelection(value: string) {
            this.resolve(this.getBitmap(value));
        }

        protected getBitmap(qName: string) {
            const sym = this.info.apis.byQName[qName];
            const jresURL = sym.attributes.jresURL;
            const data = atob(jresURL.slice(jresURL.indexOf(",") + 1))
            const magic = data.charCodeAt(0);
            const w = data.charCodeAt(1);
            const h = data.charCodeAt(2);

            const out = new Bitmap(w, h);

            let index = 4
            if (magic === 0xe1) {
                // Monochrome
                let mask = 0x01
                let v = data.charCodeAt(index++)
                for (let x = 0; x < w; ++x) {
                    for (let y = 0; y < h; ++y) {
                        out.set(x, y, (v & mask) ? 1 : 0);
                        mask <<= 1
                        if (mask == 0x100) {
                            mask = 0x01
                            v = data.charCodeAt(index++)
                        }
                    }
                }
            }
            else {
                // Color
                for (let x = 0; x < w; x++) {
                    for (let y = 0; y < h; y += 2) {
                        let v = data.charCodeAt(index++)
                        out.set(x, y, v & 0xf);
                        if (y != h - 1) {
                            out.set(x, y + 1, (v >> 4) & 0xf);
                        }
                    }
                    while (index & 3) index++
                }
            }

            return out;
        }


        protected getGalleryItems(qName: string): GalleryItem[] {
            const syms = pxt.blocks.getFixedInstanceDropdownValues(this.info.apis, qName);
            pxt.blocks.generateIcons(syms);

            return syms.map(sym => {
                return {
                    qName: sym.qName,
                    src: sym.attributes.iconURL,
                    alt: sym.qName
                };
            });
        }
    }
}