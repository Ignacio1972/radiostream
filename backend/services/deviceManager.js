class DeviceManager {
  constructor() {
    this.preferredDeviceId = null;
  }

  setPreferredDevice(deviceId) {
    this.preferredDeviceId = deviceId;
  }

  getPreferredDevice() {
    return this.preferredDeviceId;
  }

  findPreferredDevice(devices) {
    // Try cached device ID first
    if (this.preferredDeviceId) {
      const device = devices.find(d => d.id === this.preferredDeviceId);
      if (device) return device;
    }

    // Look for device named "RadioStream" or "spotifyd"
    const preferred = devices.find(d =>
      d.name.toLowerCase().includes('radiostream') ||
      d.name.toLowerCase().includes('spotifyd') ||
      d.name.toLowerCase().includes('isla')
    );

    if (preferred) {
      this.setPreferredDevice(preferred.id);
      return preferred;
    }

    return null;
  }
}

module.exports = new DeviceManager();
