/// <reference path="./winrtrefs.d.ts"/>

type DeviceWatcher = Windows.Devices.Enumeration.DeviceWatcher;
type DeviceInfo = Windows.Devices.Enumeration.DeviceInformation;
type SerialDevice = Windows.Devices.SerialCommunication.SerialDevice;

namespace pxt.winrt {
    let watcher: DeviceWatcher;
    let deviceNameFilter: RegExp;
    let activePorts: pxt.Map<DevicePort> = {}

    interface DevicePort {
        info: DeviceInfo;
        device?: SerialDevice;
    }

    export function initSerial() {
        const hasFilter = !!pxt.appTarget.serial.nameFilter ||
            (pxt.appTarget.serial.vendorId && pxt.appTarget.serial.productId);
        if (!pxt.appTarget.serial
            || !pxt.appTarget.serial.log
            || !hasFilter) return;

        const sd = Windows.Devices.SerialCommunication.SerialDevice;
        let serialDeviceSelector: string;

        if (!pxt.appTarget.serial.vendorId || !pxt.appTarget.serial.productId) {
            deviceNameFilter = new RegExp(pxt.appTarget.serial.nameFilter);
            serialDeviceSelector = sd.getDeviceSelector();
        } else {
            serialDeviceSelector = sd.getDeviceSelectorFromUsbVidPid(
                parseInt(pxt.appTarget.serial.vendorId),
                parseInt(pxt.appTarget.serial.productId)
            );
        }

        // Create a device watcher to look for instances of the Serial device
        // As per MSDN doc, to use the correct overload, we pass null as 2nd argument
        watcher = Windows.Devices.Enumeration.DeviceInformation.createWatcher(serialDeviceSelector, null);
        watcher.addEventListener("added", deviceAdded);
        watcher.addEventListener("removed", deviceRemoved);
        watcher.addEventListener("updated", deviceUpdated);
        watcher.start();
    }

    export function suspendSerial() {
        if (watcher) {
            watcher.stop();
            watcher.removeEventListener("added", deviceAdded);
            watcher.removeEventListener("removed", deviceRemoved);
            watcher.removeEventListener("updated", deviceUpdated);
            watcher = undefined;
        }

        Object.keys(activePorts).forEach((deviceId) => {
            const port = activePorts[deviceId];
            const device = port.device;
            device.close();
        });
        activePorts = {};
    }

    function deviceAdded(deviceInfo: DeviceInfo) {
        if (deviceNameFilter && !deviceNameFilter.test(deviceInfo.name)) {
            return;
        }

        pxt.debug(`serial port added ${deviceInfo.name} - ${deviceInfo.id}`);
        activePorts[deviceInfo.id] = {
            info: deviceInfo
        };
        Windows.Devices.SerialCommunication.SerialDevice.fromIdAsync(deviceInfo.id)
            .done((dev: SerialDevice) => {
                activePorts[deviceInfo.id].device = dev;
                startDevice(deviceInfo.id);
            });
    }

    function deviceRemoved(deviceInfo: DeviceInfo) {
        delete activePorts[deviceInfo.id];
    }

    function deviceUpdated(deviceInfo: DeviceInfo) {
        const port = activePorts[deviceInfo.id];
        if (port) {
            port.info.update(deviceInfo);
        }
    }

    function startDevice(id: string) {
        console.log("========================== startDevice()"); // TEMP TODO remove
        let port = activePorts[id];
        if (!port) return;
        if (!port.device) {
            let status = (Windows.Devices as any).Enumeration.DeviceAccessInformation.createFromId(id).currentStatus;
            pxt.debug(`device issue: ${status}`);
            return;
        }

        port.device.baudRate = 115200;
        let stream = port.device.inputStream;
        let reader = new Windows.Storage.Streams.DataReader(stream);
        let serialBuffers: pxt.Map<string> = {};
        let readMore = () => {
            console.log("========================== readMore()"); // TEMP TODO remove
            // Make sure the device is still active
            if (!activePorts[id]) {
                console.log("        ================== return early from readMore()"); // TEMP TODO remove
                return;
            }
            reader.loadAsync(32).done((bytesRead) => {
                let msg = reader.readString(Math.floor(bytesRead / 4) * 4);
                pxt.Util.bufferSerial(serialBuffers, msg, id);
                readMore();
            }, (e) => {
                setTimeout(() => startDevice(id), 1000);
            });
        };
        setTimeout(() => readMore(), 100);
    }
}