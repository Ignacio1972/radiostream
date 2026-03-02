const dbus = require('dbus-next');

const MPRIS_PREFIX = 'org.mpris.MediaPlayer2.spotifyd';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const PLAYER_IFACE = 'org.mpris.MediaPlayer2.Player';
const PROPS_IFACE = 'org.freedesktop.DBus.Properties';

const RECONNECT_INTERVAL = 5000;

class DbusPlayer {
  constructor() {
    this.bus = null;
    this.player = null;
    this.properties = null;
    this.connected = false;
    this.currentState = {
      track: null,
      is_playing: false,
      volume: 0,
      shuffle: false,
      repeat: 'None',
      position_us: 0
    };
    this._listeners = [];
    this._reconnectTimer = null;
  }

  async _findMprisDest() {
    const dbusObj = await this.bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus');
    const dbusIface = dbusObj.getInterface('org.freedesktop.DBus');
    const names = await dbusIface.ListNames();
    const match = names.find(n => n.startsWith(MPRIS_PREFIX));
    if (!match) throw new Error('spotifyd MPRIS not found on system bus');
    return match;
  }

  async connect() {
    // Disconnect previous bus if any
    if (this.bus) {
      console.log('[D-Bus] Disconnecting previous bus before reconnect');
      try { this.bus.disconnect(); } catch {}
      this.bus = null;
      this.player = null;
      this.properties = null;
      this.connected = false;
    }

    try {
      this.bus = dbus.systemBus();

      // Listen for bus disconnection
      this.bus.on('error', (err) => {
        console.error('[D-Bus] Bus error event:', err.message);
        this.connected = false;
        this._scheduleReconnect();
      });

      const dest = await this._findMprisDest();
      console.log(`[D-Bus] Found MPRIS at: ${dest}`);
      this._mprisDest = dest;
      const obj = await this.bus.getProxyObject(dest, MPRIS_PATH);
      this.player = obj.getInterface(PLAYER_IFACE);
      this.properties = obj.getInterface(PROPS_IFACE);

      // Watch for MPRIS name disappearing (spotifyd loses session)
      const dbusObj = await this.bus.getProxyObject('org.freedesktop.DBus', '/org/freedesktop/DBus');
      const dbusIface = dbusObj.getInterface('org.freedesktop.DBus');
      dbusIface.on('NameOwnerChanged', (name, oldOwner, newOwner) => {
        if (name === dest && newOwner === '') {
          console.warn(`[D-Bus] MPRIS name vanished: ${name} — spotifyd lost session`);
          this.connected = false;
          this.player = null;
          this.properties = null;
          this.currentState.is_playing = false;
          this._emit('state-changed', null);
          this._scheduleReconnect();
        }
      });

      await this._refreshState();
      console.log('[D-Bus] Initial state:', JSON.stringify({
        is_playing: this.currentState.is_playing,
        track: this.currentState.track?.name,
        volume: this.currentState.volume,
        position_us: this.currentState.position_us
      }));

      this.properties.on('PropertiesChanged', (iface, changed) => {
        if (iface !== PLAYER_IFACE) return;

        const changedKeys = Object.keys(changed);
        console.log('[D-Bus] PropertiesChanged:', changedKeys.join(', '));

        if (changed.Metadata) {
          this.currentState.track = this._parseMetadata(changed.Metadata.value);
          console.log('[D-Bus] New track:', this.currentState.track.name, '-', this.currentState.track.artist);
        }
        if (changed.PlaybackStatus) {
          const prev = this.currentState.is_playing;
          this.currentState.is_playing = changed.PlaybackStatus.value === 'Playing';
          console.log(`[D-Bus] PlaybackStatus: ${changed.PlaybackStatus.value} (was ${prev ? 'Playing' : 'Paused'})`);
        }
        if (changed.Volume) {
          this.currentState.volume = Math.round(changed.Volume.value * 100);
        }
        if (changed.Shuffle) {
          this.currentState.shuffle = changed.Shuffle.value;
        }
        if (changed.LoopStatus) {
          this.currentState.repeat = changed.LoopStatus.value;
        }

        this._emit('state-changed', this.getState());
      });

      this.connected = true;
      this._clearReconnect();
      console.log('[D-Bus] Connected to spotifyd MPRIS');
    } catch (err) {
      console.error('[D-Bus] Connection failed:', err.message);
      this.connected = false;
      // Clean up failed bus
      if (this.bus) {
        try { this.bus.disconnect(); } catch {}
        this.bus = null;
      }
      this._scheduleReconnect();
      throw err;
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setInterval(async () => {
      try {
        console.log('[D-Bus] Attempting reconnection...');
        await this.connect();
      } catch {
        // connect() already logs the error
      }
    }, RECONNECT_INTERVAL);
  }

  _clearReconnect() {
    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  // Wrap control calls to handle stale connections
  async _safeCall(fn, label = 'unknown') {
    if (!this.connected) {
      console.warn(`[D-Bus] _safeCall(${label}): not connected, rejecting`);
      throw new Error('D-Bus not connected');
    }
    try {
      console.log(`[D-Bus] _safeCall(${label}): calling...`);
      const result = await fn();
      console.log(`[D-Bus] _safeCall(${label}): success`);
      return result;
    } catch (err) {
      console.error(`[D-Bus] _safeCall(${label}) failed:`, err.message);
      this.connected = false;
      this._scheduleReconnect();
      throw err;
    }
  }

  async _refreshState() {
    console.log('[D-Bus] Refreshing state...');
    const getProperty = async (prop) => {
      try {
        const variant = await this.properties.Get(PLAYER_IFACE, prop);
        return variant.value;
      } catch (err) {
        console.warn(`[D-Bus] Failed to get property ${prop}:`, err.message);
        return null;
      }
    };

    const metadata = await getProperty('Metadata');
    const status = await getProperty('PlaybackStatus');
    const volume = await getProperty('Volume');
    const shuffle = await getProperty('Shuffle');
    const loop = await getProperty('LoopStatus');
    const position = await getProperty('Position');

    if (metadata) this.currentState.track = this._parseMetadata(metadata);
    if (status) this.currentState.is_playing = status === 'Playing';
    if (volume !== null) this.currentState.volume = Math.round(volume * 100);
    if (shuffle !== null) this.currentState.shuffle = shuffle;
    if (loop) this.currentState.repeat = loop;
    if (position !== null) this.currentState.position_us = Number(position);
  }

  _parseMetadata(meta) {
    const get = (key) => {
      const val = meta[key];
      if (!val) return null;
      return val.value !== undefined ? val.value : val;
    };

    const artists = get('xesam:artist');
    const artUrl = get('mpris:artUrl');
    const length = get('mpris:length');

    return {
      name: get('xesam:title') || 'Unknown',
      artist: Array.isArray(artists) ? artists.join(', ') : (artists || 'Unknown'),
      album: get('xesam:album') || '',
      artwork: artUrl || null,
      duration_ms: length ? Math.round(Number(length) / 1000) : 0
    };
  }

  getState() {
    if (!this.connected) {
      console.log('[D-Bus] getState: not connected, returning null');
      return null;
    }
    const track = this.currentState.track;
    if (!track) return null;

    return {
      name: track.name,
      artist: track.artist,
      album: track.album,
      artwork: {
        large: track.artwork,
        medium: track.artwork,
        small: track.artwork
      },
      duration_ms: track.duration_ms,
      progress_ms: Math.round(this.currentState.position_us / 1000),
      is_playing: this.currentState.is_playing,
      shuffle_state: this.currentState.shuffle,
      repeat_state: this._mprisLoopToSpotify(this.currentState.repeat),
      device: {
        name: 'RadioStream',
        volume_percent: this.currentState.volume
      }
    };
  }

  _mprisLoopToSpotify(mprisLoop) {
    switch (mprisLoop) {
      case 'Track': return 'track';
      case 'Playlist': return 'context';
      default: return 'off';
    }
  }

  _spotifyLoopToMpris(spotifyRepeat) {
    switch (spotifyRepeat) {
      case 'track': return 'Track';
      case 'context': return 'Playlist';
      default: return 'None';
    }
  }

  // --- Control methods (all wrapped with _safeCall) ---

  async play() {
    await this._safeCall(() => this.player.Play(), 'Play');

    // Verify playback actually started — spotifyd sometimes ignores Play after long pause
    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise(r => setTimeout(r, 1500));
      try {
        const status = await this.properties.Get(PLAYER_IFACE, 'PlaybackStatus');
        if (status.value === 'Playing') {
          console.log(`[D-Bus] Play confirmed on attempt ${attempt}`);
          return;
        }
        console.warn(`[D-Bus] Play not confirmed (status=${status.value}), retry ${attempt}/3`);
        await this.player.Play();
      } catch (err) {
        console.error(`[D-Bus] Play verify failed:`, err.message);
        break;
      }
    }
  }

  async pause() {
    return this._safeCall(() => this.player.Pause(), 'Pause');
  }

  async next() {
    return this._safeCall(() => this.player.Next(), 'Next');
  }

  async previous() {
    return this._safeCall(() => this.player.Previous(), 'Previous');
  }

  async seek(positionMs) {
    return this._safeCall(() => {
      const currentPos = this.currentState.position_us;
      const targetUs = positionMs * 1000;
      const offsetUs = targetUs - currentPos;
      console.log(`[D-Bus] Seek: currentPos=${currentPos}us, target=${targetUs}us, offset=${offsetUs}us`);
      return this.player.Seek(BigInt(offsetUs));
    }, 'Seek');
  }

  async setVolume(volumePercent) {
    return this._safeCall(() => {
      const vol = Math.max(0, Math.min(100, volumePercent)) / 100;
      console.log(`[D-Bus] SetVolume: ${volumePercent}% → ${vol}`);
      return this.properties.Set(
        PLAYER_IFACE,
        'Volume',
        new dbus.Variant('d', vol)
      );
    }, 'SetVolume');
  }

  async setShuffle(state) {
    return this._safeCall(() => {
      console.log(`[D-Bus] SetShuffle: ${state}`);
      return this.properties.Set(
        PLAYER_IFACE,
        'Shuffle',
        new dbus.Variant('b', Boolean(state))
      );
    }, 'SetShuffle');
  }

  async setRepeat(state) {
    return this._safeCall(() => {
      const mprisState = this._spotifyLoopToMpris(state);
      console.log(`[D-Bus] SetRepeat: ${state} → ${mprisState}`);
      return this.properties.Set(
        PLAYER_IFACE,
        'LoopStatus',
        new dbus.Variant('s', mprisState)
      );
    }, 'SetRepeat');
  }

  async getPosition() {
    if (!this.connected || !this.properties) {
      console.warn('[D-Bus] getPosition: not connected');
      return 0;
    }
    try {
      const variant = await this.properties.Get(PLAYER_IFACE, 'Position');
      this.currentState.position_us = Number(variant.value);
      return Math.round(this.currentState.position_us / 1000);
    } catch (err) {
      console.error('[D-Bus] getPosition failed:', err.message);
      // Don't kill the whole D-Bus connection for a transient position read failure
      return 0;
    }
  }

  // --- Event system ---

  onChange(callback) {
    this._listeners.push(callback);
  }

  _emit(event, data) {
    for (const cb of this._listeners) {
      try { cb(event, data); } catch (e) { console.error('[D-Bus] Listener error:', e); }
    }
  }

  async disconnect() {
    this._clearReconnect();
    if (this.bus) {
      try { this.bus.disconnect(); } catch {}
      this.bus = null;
      this.connected = false;
    }
  }
}

const dbusPlayer = new DbusPlayer();
module.exports = dbusPlayer;
