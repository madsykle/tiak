declare namespace JSX {
	interface IntrinsicElements {
		"media-controller": React.DetailedHTMLProps<
			React.HTMLAttributes<HTMLElement>,
			HTMLElement
		> & { slot?: string };
		"media-control-bar": React.DetailedHTMLProps<
			React.HTMLAttributes<HTMLElement>,
			HTMLElement
		> & { slot?: string };
		"media-play-button": React.DetailedHTMLProps<
			React.HTMLAttributes<HTMLElement>,
			HTMLElement
		> & { slot?: string };
		"media-seek-bar": React.DetailedHTMLProps<
			React.HTMLAttributes<HTMLElement>,
			HTMLElement
		> & { slot?: string };
		"media-time-range": React.DetailedHTMLProps<
			React.HTMLAttributes<HTMLElement>,
			HTMLElement
		> & { slot?: string };
		"media-mute-button": React.DetailedHTMLProps<
			React.HTMLAttributes<HTMLElement>,
			HTMLElement
		> & { slot?: string };
		"media-volume-range": React.DetailedHTMLProps<
			React.HTMLAttributes<HTMLElement>,
			HTMLElement
		> & { slot?: string };
		"media-fullscreen-button": React.DetailedHTMLProps<
			React.HTMLAttributes<HTMLElement>,
			HTMLElement
		> & { slot?: string };
	}
}
