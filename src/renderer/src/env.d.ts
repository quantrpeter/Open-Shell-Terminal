import type { OshellApi } from '../../shared/types'

declare global {
	interface Window {
		oshell: OshellApi
	}
}

export {}
