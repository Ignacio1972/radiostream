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
    try {
      this.bus = dbus.systemBus();

      const dest = await this._findMprisDest();
      const obj = await this.bus.getProxyObject(dest, MPRIS_PATH);
      this.player = obj.getInterface(PLAYER_IFACE);
      this.properties = obj.getInterface(PROPS_IFACE);

      await this._refreshState();

      this.properties.on('PropertiesChanged', (iface, changed) => {
        if (iface !== PLAYER_IFACE) return;

        if (changed.Metadata) {
          this.currentState.track = this._parseMetadata(changed.Metadata.value);
        }
        if (changed.PlaybackStatus) {
          this.currentState.is_playing = changed.PlaybackStatus.value === 'Playing';
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

  async _refreshState() {
    const getProperty = async (prop) => {
      try {
        const variant = await this.properties.Get(PLAYER_IFACE, prop);
        return variant.value;
      } catch {
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

  // --- Control methods ---

  async play() {
    await this.player.Play();
  }

  async pause() {
    await this.player.Pause();
  }

  async next() {
    await this.player.Next();
  }

  async previous() {
    await this.player.Previous();
  }

  async seek(positionMs) {
    const currentPos = this.currentState.position_us;
    const targetUs = positionMs * 1000;
    const offsetUs = targetUs - currentPos;
    await this.player.Seek(BigInt(offsetUs));
  }

  async setVolume(volumePercent) {
    const vol = Math.max(0, Math.min(100, volumePercent)) / 100;
    await this.properties.Set(
      PLAYER_IFACE,
      'Volume',
      new dbus.Variant('d', vol)
    );
  }

  async setShuffle(state) {
    await this.properties.Set(
      PLAYER_IFACE,
      'Shuffle',
      new dbus.Variant('b', Boolean(state))
    );
  }

  async setRepeat(state) {
    const mprisState = this._spotifyLoopToMpris(state);
    await this.properties.Set(
      PLAYER_IFACE,
      'LoopStatus',
      new dbus.Variant('s', mprisState)
    );
  }

  async getPosition() {
    try {
      const variant = await this.properties.Get(PLAYER_IFACE, 'Position');
      this.currentState.position_us = Number(variant.value);
      return Math.round(this.currentState.position_us / 1000);
    } catch {
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
      this.bus.disconnect();
      this.connected = false;
    }
  }
}

const dbusPlayer = new DbusPlayer();
module.exports = dbusPlayer;
