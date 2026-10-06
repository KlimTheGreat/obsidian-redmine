// textile-js ships no types; this covers the one call the plugin makes.
declare module 'textile-js' {
	interface TextileOptions {
		/** Single newlines inside a block become <br> (default true). */
		breaks?: boolean;
	}
	function textile(source: string, options?: TextileOptions): string;
	export default textile;
}
