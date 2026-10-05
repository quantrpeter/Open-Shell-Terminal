// Quote a value as one Open Shell argument. The shell splits with shlex: POSIX
// rules everywhere except Windows, where backslashes stay literal.

export function shellQuote(value: string, windows: boolean): string {
	if (value !== '' && /^[A-Za-z0-9_@%+=:,./~-]+$/.test(value)) return value
	if (windows) return `"${value.replace(/"/g, '')}"`
	return `'${value.replace(/'/g, `'\\''`)}'`
}
