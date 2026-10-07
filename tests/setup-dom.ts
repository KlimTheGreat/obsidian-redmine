// jsdom has no layout. CodeMirror measures text through Range rects; empty rects are enough for tests.
const emptyRects = (): DOMRectList => Object.assign([], { item: () => null }) as unknown as DOMRectList;
Range.prototype.getClientRects = emptyRects;
Range.prototype.getBoundingClientRect = () => new DOMRect();
