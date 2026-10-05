import type { RouteAIAdapter } from './types';
export const unavailableAdapter: RouteAIAdapter = {
  async getAvailability(){return 'NATIVE_UNAVAILABLE';},
  async createSession(){throw new Error('NATIVE_UNAVAILABLE');},
  async interpret(){throw new Error('NATIVE_UNAVAILABLE');},
  async format(){throw new Error('NATIVE_UNAVAILABLE');},
  async resetSession(){},
};
