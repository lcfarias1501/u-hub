import type { UHubApi } from './index'

declare global {
  interface Window {
    uhub: UHubApi
  }
}
