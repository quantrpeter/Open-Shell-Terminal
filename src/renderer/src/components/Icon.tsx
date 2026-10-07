// Material Symbols Outlined, filled via font ligatures.
// Names: https://fonts.google.com/icons

export function Icon({ name, className }: { name: string; className?: string }): React.JSX.Element {
	return (
		<span className={className ? `material-symbols-outlined ${className}` : 'material-symbols-outlined'} aria-hidden="true">
			{name}
		</span>
	)
}
