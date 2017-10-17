/// <reference path="../../localtypings/smoothie.d.ts" />

import * as React from "react"
import * as pkg from "./package"
import * as core from "./core"
import * as srceditor from "./srceditor"
import * as sui from "./sui"
import * as codecard from "./codecard"
import * as data from "./data";

import Cloud = pxt.Cloud
import Util = pxt.Util

const lf = Util.lf

export class Editor extends srceditor.Editor {
    charts: Chart[] = []
    chartIdx: number = 0
    consoleBuffer: string = ""
    isSim: boolean = true
    maxConsoleLineLength: number = 500
    maxConsoleEntries: number = 100
    active: boolean = true
    rawDataBuffer: string = ""
    maxBufferLength: number = 5000
    maxChartTime: number = 18000
    chartDropper: number

    //refs
    startPauseButton: StartPauseButton
    consoleRoot: HTMLElement
    chartRoot: HTMLElement

    getId() {
        return "serialEditor"
    }

    hasEditorToolbar() {
        return false
    }

    setVisible(b: boolean) {
        this.isVisible = b;
        if (this.isVisible) {
            this.startRecording()
            this.chartDropper = setInterval(this.dropStaleCharts.bind(this), 5000)
        }
        else {
            this.pauseRecording()
            clearInterval(this.chartDropper)
        }
    }

    acceptsFile(file: pkg.File) {
        return file.name === pxt.SERIAL_EDITOR_FILE;
    }

    setSim(b: boolean) {
        this.isSim = b
        this.clear()
    }

    constructor(public parent: pxt.editor.IProjectView) {
        super(parent)
        window.addEventListener("message", this.processMessage.bind(this), false)
    }

    processMessage(ev: MessageEvent) {
        let msg = ev.data
        if (!this.active || msg.type !== "serial") return;

        const smsg = msg as pxsim.SimulatorSerialMessage
        const sim = !!smsg.sim
        if (sim != this.isSim) return;

        const data = smsg.data || ""
        const source = smsg.id || "?"
        let theme = source.split("-")[0] || "black"

        this.appendRawData(data)

        const m = /^\s*(([^:]+):)?\s*(-?\d+(\.\d*)?)/i.exec(data);
        if (m) {
            const variable = m[2] || '';
            const nvalue = parseFloat(m[3]);
            if (!isNaN(nvalue)) {
                this.appendGraphEntry(source, theme, sim, variable, nvalue)
                return;
            }
        }

        this.appendConsoleEntry(data)
    }

    appendRawData(data: string) {
        this.rawDataBuffer += data
        let excessChars = this.rawDataBuffer.length - this.maxBufferLength
        if (excessChars > 0) {
            this.rawDataBuffer = this.rawDataBuffer.slice(excessChars)
        }
    }

    appendGraphEntry(source: string, theme: string, sim: boolean, variable: string, nvalue: number) {
        //See if there is a "home chart" that this point belongs to -
        //if not, create a new chart
        let homeChart: Chart = undefined
        for (let i = 0; i < this.charts.length; ++i) {
            let chart = this.charts[i]
            if (chart.shouldContain(source, variable)) {
                homeChart = chart
                break
            }
        }
        if (homeChart) {
            homeChart.addPoint(nvalue)
        } else {
            let newChart = new Chart(source, variable, nvalue, this.chartIdx)
            this.chartIdx++
            this.charts.push(newChart)
            this.chartRoot.appendChild(newChart.getElement())
        }
    }

    appendConsoleEntry(data: string) {
        for (let i = 0; i < data.length; ++i) {
            let ch = data[i]
            this.consoleBuffer += ch
            if (ch === "\n" || this.consoleBuffer.length > this.maxConsoleLineLength) {

                let lastEntry = this.consoleRoot.lastChild
                let newEntry = document.createElement("div")
                if (lastEntry && lastEntry.lastChild.textContent == this.consoleBuffer) {
                    if (lastEntry.childNodes.length == 2) {
                        //matches already-collapsed entry
                        let count = parseInt(lastEntry.firstChild.textContent)
                        lastEntry.firstChild.textContent = (count + 1).toString()
                    } else {
                        //make a new collapsed entry with count = 2
                        let newLabel = document.createElement("a")
                        newLabel.className = "ui horizontal label"
                        newLabel.textContent = "2"
                        lastEntry.insertBefore(newLabel, lastEntry.lastChild)
                    }
                } else {
                    //make a new non-collapsed entry
                    newEntry.appendChild(document.createTextNode(this.consoleBuffer))
                    this.consoleRoot.appendChild(newEntry)
                    this.consoleRoot.scrollTop = this.consoleRoot.scrollHeight
                }
                if (this.consoleRoot.childElementCount > this.maxConsoleEntries) {
                    this.consoleRoot.removeChild(this.consoleRoot.firstChild)
                }
                this.consoleBuffer = ""
            }
        }
    }

    dropStaleCharts() {
        let now = Util.now()
        this.charts.forEach((chart) => {
            if (now - chart.lastUpdatedTime > this.maxChartTime) {
                this.chartRoot.removeChild(chart.rootElement)
                chart.isStale = true
            }
        })
        this.charts = this.charts.filter(c => !c.isStale)
    }

    pauseRecording() {
        this.active = false
        if (this.startPauseButton) this.startPauseButton.setState({ active: this.active });
        this.charts.forEach(s => s.stop())
    }

    startRecording() {
        this.active = true
        if (this.startPauseButton) this.startPauseButton.setState({ active: this.active });
        this.charts.forEach(s => s.start())
    }

    toggleRecording() {
        pxt.tickEvent("serial.toggleRecording")
        if (this.active) this.pauseRecording()
        else this.startRecording()
    }

    clearNode(e: HTMLElement) {
        while (e.hasChildNodes()) {
            e.removeChild(e.firstChild)
        }
    }

    clear() {
        if (this.chartRoot) this.clearNode(this.chartRoot)
        if (this.clearNode) this.clearNode(this.consoleRoot)
        this.charts = []
        this.consoleBuffer = ""
    }

    entriesToPlaintext() {
        return this.rawDataBuffer
    }

    entriesToCSV() {
        let csv = this.charts.map(chart => `time (s), ${chart.variable} (${chart.source})`).join(', ') + '\r\n';
        const datas = this.charts.map(chart => chart.line.data);
        const nl = datas.map(data => data.length).reduce((l, c) => Math.max(l, c));
        const nc = this.charts.length;
        for (let i = 0; i < nl; ++i) {
            csv += datas.map(data => i < data.length ? `${(data[i][0] - data[0][0]) / 1000}, ${data[i][1]}` : ' , ').join(', ');
            csv += '\r\n';
        }
        return csv;
    }

    showExportDialog() {
        pxt.tickEvent("serial.showExportDialog")
        const targetTheme = pxt.appTarget.appTheme
        let rootUrl = targetTheme.embedUrl
        if (!rootUrl) {
            pxt.commands.browserDownloadAsync(this.entriesToPlaintext(), "data.txt", "text/plain")
            return
        }
        if (!/\/$/.test(rootUrl)) rootUrl += '/'

        core.confirmAsync({
            logos: undefined,
            header: lf("Export data"),
            hideAgree: true,
            disagreeLbl: lf("Close"),
            onLoaded: (_) => {
                _.find('#datasavecsvfile').click(() => {
                    pxt.tickEvent("serial.dataExported.csv")
                    _.modal('hide')
                    pxt.commands.browserDownloadAsync(this.entriesToCSV(), "data.csv", "text/csv")
                })
                _.find('#datasavetxtfile').click(() => {
                    pxt.tickEvent("serial.dataExported.txt")
                    _.modal('hide')
                    pxt.commands.browserDownloadAsync(this.entriesToPlaintext(), "data.txt", "text/plain")
                })
            },
            htmlBody:
            `<div></div>
                <div class="ui cards" role="listbox">
                    <div  id="datasavecsvfile" class="ui link card">
                        <div class="content">
                            <div class="header">${lf("CSV File")}</div>
                            <div class="description">
                                ${lf("Save the chart data streams.")}
                            </div>
                        </div>
                        <div class="ui bottom attached button">
                            <i class="download icon"></i>
                            ${lf("Download")}
                        </div>
                    </div>
                    <div id="datasavetxtfile" class="ui link card">
                        <div class="content">
                            <div class="header">${lf("Text File")}</div>
                            <div class="description">
                                ${lf("Save the text output.")}
                            </div>
                        </div>
                        <div class="ui bottom attached button">
                            <i class="download icon"></i>
                            ${lf("Download")}
                        </div>
                    </div>
                </div>`
        }).done()
    }

    goBack() {
        pxt.tickEvent("serial.backButton")
        this.parent.openPreviousEditor()
    }

    display() {
        return (
            <div id="serialArea">
                <div id="serialHeader" className="ui">
                    <div className="leftHeaderWrapper">
                        <div className="leftHeader">
                            <StartPauseButton ref={e => this.startPauseButton = e} active={this.active} toggle={this.toggleRecording.bind(this) } />
                            <span className="ui small header">{this.isSim ? lf("Simulator") : lf("Device") }</span>
                        </div>
                    </div>
                    <div className="rightHeader">
                        <sui.Button class="ui icon circular small inverted button" onClick={this.goBack.bind(this) }>
                            <sui.Icon icon="close" />
                        </sui.Button>
                    </div>
                </div>
                <div id="serialCharts" ref={e => this.chartRoot = e}></div>
                <div className="ui fitted divider"></div>
                <div id="serialConsole" ref={e => this.consoleRoot = e}></div>
                <div id="serialToolbox">
                    <div className="ui grid right aligned padded">
                        <div className="column">
                            <sui.Button class="ui small basic blue button" onClick={this.showExportDialog.bind(this) }>
                                <sui.Icon icon="download" /> {lf("Export data") }
                            </sui.Button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    domUpdate() {
    }
}

export interface StartPauseButtonProps {
    active?: boolean;
    toggle?: () => void;
}

export interface StartPauseButtonState {
    active?: boolean;
}

export class StartPauseButton extends data.Component<StartPauseButtonProps, StartPauseButtonState> {
    constructor(props: StartPauseButtonProps) {
        super(props);
        this.state = {
            active: this.props.active
        }
    }

    renderCore() {
        const {toggle} = this.props;
        const {active} = this.state;

        return <sui.Button class={`ui left floated icon button ${active ? "green" : "red circular"} toggleRecord`} onClick={toggle}>
            <sui.Icon icon={active ? "pause icon" : "circle icon"} />
        </sui.Button>
    }
}

class Chart {
    rootElement: HTMLElement = document.createElement("div")
    canvas: HTMLCanvasElement;
    label: HTMLDivElement;
    line: TimeSeries = new TimeSeries();
    source: string;
    variable: string;
    chart: SmoothieChart;
    isStale: boolean = false;
    lastUpdatedTime: number = 0;

    constructor(source: string, variable: string, value: number, chartIdx: number) {
        const serialTheme = pxt.appTarget.serial && pxt.appTarget.serial.editorTheme
        // Initialize chart
        const chartConfig: IChartOptions = {
            interpolation: 'bezier',
            responsive: true,
            millisPerPixel: 20,
            grid: {
                verticalSections: 0,
                borderVisible: false,
                fillStyle: serialTheme && serialTheme.graphBackground || '#fff',
                strokeStyle: serialTheme && serialTheme.graphBackground || '#fff'
            }
        }
        this.chart = new SmoothieChart(chartConfig)
        const lineColors = serialTheme && serialTheme.lineColors || ["#f00", "#00f", "#0f0", "#ff0"]
        let lineColor = lineColors[chartIdx % (lineColors.length)]
        this.rootElement.className = "ui segment"
        this.source = source
        this.variable = variable
        this.chart.addTimeSeries(this.line, {strokeStyle: lineColor, fillStyle: this.hexToHalfOpacityRgba(lineColor), lineWidth: 3})

        this.rootElement.appendChild(this.makeLabel())
        this.rootElement.appendChild(this.makeCanvas())
        this.addPoint(value)
    }

    hexToHalfOpacityRgba(hex: string) {
        let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i
        hex = hex.replace(shorthandRegex, function(m, r, g, b) {
            return r + r + g + g + b + b;
        })
        let m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
        if (!m) {
            return hex
        }
        let nums = m.slice(1, 4).map(n => parseInt(n, 16))
        nums.push(0.7)
        return "rgba(" + nums.join(",") + ")"
    }

    makeLabel() {
        this.label = document.createElement("div")
        this.label.className = "ui orange bottom left attached label seriallabel"
        this.label.innerText = this.variable || "...";
        return this.label;
    }

    makeCanvas() {
        let canvas = document.createElement("canvas");
        this.chart.streamTo(canvas);
        this.canvas = canvas;
        this.canvas.addEventListener("click", ev => {
            pxt.commands.browserDownloadAsync(this.toCSV(), "data.csv", "text/csv")
        }, false);
        return canvas
    }

    getCanvas() {
        return this.canvas
    }

    getElement() {
        return this.rootElement
    }

    shouldContain(source: string, variable: string) {
        return this.source == source && this.variable == variable
    }

    addPoint(value: number) {
        this.line.append(Util.now(), value)
        this.lastUpdatedTime = Util.now();
        // update label with last value
        const valueText = Number(Math.round(Number(value + "e+2"))  + "e-2").toString();
        this.label.innerText = this.variable ? `${this.variable}: ${valueText}` : valueText;
    }

    start() {
        this.chart.start()
    }

    stop() {
        this.chart.stop()
    }

    toCSV(): string {
        const data = this.line.data;
        if (data.length == 0) return '';
        const t0 = data[0][0];
        return `time (s), ${this.variable}, ${lf("Tip: Insert a Scatter Chart to visualize this data.")}\r\n` +
            data.map(row => ((row[0] - t0) / 1000) + ", " + row[1]).join('\r\n');
    }
}