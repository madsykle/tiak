import type { SVGProps } from "react";

interface LogoProps extends SVGProps<SVGSVGElement> {
	showWordmark?: boolean;
	markClassName?: string;
}

export default function Logo({
	showWordmark = false,
	markClassName = "",
	className,
	...props
}: LogoProps) {
	return (
		<svg
			viewBox={showWordmark ? "0 0 176 40" : "0 0 40 40"}
			role="img"
			aria-label="Tiak"
			className={className}
			{...props}
		>
			<g className={markClassName}>
				<rect x="1" y="1" width="38" height="38" rx="12" fill="currentColor" opacity="0.14" />
				<path
				d="M12 13.5h9.5c3.59 0 6.5 2.91 6.5 6.5s-2.91 6.5-6.5 6.5H12"
					fill="none"
					stroke="currentColor"
					strokeWidth="3.2"
					strokeLinecap="round"
				/>
				<path
					d="M16 9.5h9.5c5.8 0 10.5 4.7 10.5 10.5s-4.7 10.5-10.5 10.5H16"
					fill="none"
					stroke="currentColor"
					strokeWidth="3.2"
					strokeLinecap="round"
					opacity="0.48"
				/>
				<circle cx="12" cy="13.5" r="2.2" fill="currentColor" />
			</g>
			{showWordmark && (
				<text
					x="52"
					y="27"
					fill="currentColor"
					fontFamily="var(--font-geist-sans), sans-serif"
					fontSize="22"
					fontWeight="650"
					letterSpacing="-0.8"
				>
					Tiak
				</text>
			)}
		</svg>
	);
}
