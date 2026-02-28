const axios = require('axios');

const spotifyAxios = axios.create({
  timeout: 10000
});

class SpotifyService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseURL = 'https://api.spotify.com/v1';
    this.axios = spotifyAxios;
  }

  get authHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  handleApiError(error) {
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error?.message || error.message;

      switch (status) {
        case 401:
          throw new Error('TOKEN_EXPIRED');
        case 403:
          throw new Error(`FORBIDDEN: ${message}`);
        case 404:
          throw new Error(`NOT_FOUND: ${message}`);
        case 429:
          const retryAfter = error.response.headers['retry-after'] || 1;
          throw new Error(`RATE_LIMITED: Retry after ${retryAfter}s`);
        case 502:
        case 503:
          throw new Error('SPOTIFY_UNAVAILABLE');
        default:
          throw new Error(`SPOTIFY_ERROR: ${status} - ${message}`);
      }
    }
    throw error;
  }

  async getCurrentTrack() {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/me/player/currently-playing`,
        { headers: this.authHeaders }
      );

      if (response.status === 204 || !response.data || !response.data.item) {
        return null;
      }

      const item = response.data.item;
      const isTrack = item.type === 'track';

      return {
        id: item.id,
        name: item.name,
        type: item.type,
        artist: isTrack ? item.artists.map(a => a.name).join(', ') : item.show?.name,
        artists: isTrack ? item.artists.map(a => ({ id: a.id, name: a.name })) : [],
        album: isTrack ? item.album.name : item.show?.name,
        album_id: isTrack ? item.album.id : null,
        artwork: {
          large: item.album?.images[0]?.url || item.images?.[0]?.url || null,
          medium: item.album?.images[1]?.url || item.images?.[1]?.url || null,
          small: item.album?.images[2]?.url || item.images?.[2]?.url || null
        },
        duration_ms: item.duration_ms,
        progress_ms: response.data.progress_ms,
        is_playing: response.data.is_playing,
        shuffle_state: response.data.shuffle_state,
        repeat_state: response.data.repeat_state,
        context: response.data.context ? {
          type: response.data.context.type,
          uri: response.data.context.uri
        } : null,
        device: response.data.device ? {
          id: response.data.device.id,
          name: response.data.device.name,
          type: response.data.device.type,
          volume_percent: response.data.device.volume_percent
        } : null
      };
    } catch (error) {
      if (error.response?.status === 204) {
        return null;
      }
      this.handleApiError(error);
    }
  }

  async getPlaybackState() {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/me/player`,
        { headers: this.authHeaders }
      );

      if (response.status === 204 || !response.data) {
        return null;
      }

      return {
        device: response.data.device,
        repeat_state: response.data.repeat_state,
        shuffle_state: response.data.shuffle_state,
        context: response.data.context,
        timestamp: response.data.timestamp,
        progress_ms: response.data.progress_ms,
        is_playing: response.data.is_playing,
        item: response.data.item,
        currently_playing_type: response.data.currently_playing_type,
        actions: response.data.actions
      };
    } catch (error) {
      if (error.response?.status === 204) {
        return null;
      }
      this.handleApiError(error);
    }
  }

  async play(deviceId = null, options = {}) {
    try {
      const url = deviceId
        ? `${this.baseURL}/me/player/play?device_id=${deviceId}`
        : `${this.baseURL}/me/player/play`;

      const body = {};
      if (options.context_uri) body.context_uri = options.context_uri;
      if (options.uris) body.uris = options.uris;
      if (options.offset) body.offset = options.offset;
      if (options.position_ms) body.position_ms = options.position_ms;

      await this.axios.put(url, Object.keys(body).length > 0 ? body : null, {
        headers: this.authHeaders
      });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async pause(deviceId = null) {
    try {
      const url = deviceId
        ? `${this.baseURL}/me/player/pause?device_id=${deviceId}`
        : `${this.baseURL}/me/player/pause`;

      await this.axios.put(url, null, { headers: this.authHeaders });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async next(deviceId = null) {
    try {
      const url = deviceId
        ? `${this.baseURL}/me/player/next?device_id=${deviceId}`
        : `${this.baseURL}/me/player/next`;

      await this.axios.post(url, null, { headers: this.authHeaders });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async previous(deviceId = null) {
    try {
      const url = deviceId
        ? `${this.baseURL}/me/player/previous?device_id=${deviceId}`
        : `${this.baseURL}/me/player/previous`;

      await this.axios.post(url, null, { headers: this.authHeaders });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async seek(positionMs, deviceId = null) {
    try {
      const url = deviceId
        ? `${this.baseURL}/me/player/seek?position_ms=${positionMs}&device_id=${deviceId}`
        : `${this.baseURL}/me/player/seek?position_ms=${positionMs}`;

      await this.axios.put(url, null, { headers: this.authHeaders });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async setVolume(volumePercent, deviceId = null) {
    try {
      const volume = Math.max(0, Math.min(100, Math.round(volumePercent)));
      const url = deviceId
        ? `${this.baseURL}/me/player/volume?volume_percent=${volume}&device_id=${deviceId}`
        : `${this.baseURL}/me/player/volume?volume_percent=${volume}`;

      await this.axios.put(url, null, { headers: this.authHeaders });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async setShuffle(state, deviceId = null) {
    try {
      const url = deviceId
        ? `${this.baseURL}/me/player/shuffle?state=${state}&device_id=${deviceId}`
        : `${this.baseURL}/me/player/shuffle?state=${state}`;

      await this.axios.put(url, null, { headers: this.authHeaders });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async setRepeat(state, deviceId = null) {
    try {
      const validStates = ['track', 'context', 'off'];
      if (!validStates.includes(state)) {
        throw new Error(`Invalid repeat state. Must be one of: ${validStates.join(', ')}`);
      }

      const url = deviceId
        ? `${this.baseURL}/me/player/repeat?state=${state}&device_id=${deviceId}`
        : `${this.baseURL}/me/player/repeat?state=${state}`;

      await this.axios.put(url, null, { headers: this.authHeaders });
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async getDevices() {
    try {
      const response = await this.axios.get(
        `${this.baseURL}/me/player/devices`,
        { headers: this.authHeaders }
      );

      return response.data.devices.map(device => ({
        id: device.id,
        name: device.name,
        type: device.type,
        is_active: device.is_active,
        is_private_session: device.is_private_session,
        is_restricted: device.is_restricted,
        volume_percent: device.volume_percent,
        supports_volume: device.supports_volume
      }));
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async transferPlayback(deviceId, play = true) {
    try {
      await this.axios.put(
        `${this.baseURL}/me/player`,
        {
          device_ids: [deviceId],
          play: play
        },
        { headers: this.authHeaders }
      );
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async checkSavedTracks(trackIds) {
    try {
      const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
      const response = await this.axios.get(
        `${this.baseURL}/me/tracks/contains`,
        {
          headers: this.authHeaders,
          params: { ids: ids.join(',') }
        }
      );
      return response.data;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async saveTracks(trackIds) {
    try {
      const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
      await this.axios.put(
        `${this.baseURL}/me/tracks`,
        { ids },
        { headers: this.authHeaders }
      );
    } catch (error) {
      this.handleApiError(error);
    }
  }

  async removeTracks(trackIds) {
    try {
      const ids = Array.isArray(trackIds) ? trackIds : [trackIds];
      await this.axios.delete(
        `${this.baseURL}/me/tracks`,
        {
          headers: this.authHeaders,
          data: { ids }
        }
      );
    } catch (error) {
      this.handleApiError(error);
    }
  }
}

module.exports = SpotifyService;
