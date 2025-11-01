import type { Html } from "./node.ts";
import type { FixiAttributes } from "./fixi.ts";
import type { Handler, Ref as ClientRef } from "../components/client.ts";
import type { ClientEventList } from "../events.ts";

type ElementForTag<Tag extends string> = Tag extends keyof HTMLElementTagNameMap
  ? HTMLElementTagNameMap[Tag]
  : Tag extends keyof SVGElementTagNameMap ? SVGElementTagNameMap[Tag]
  : Tag extends keyof MathMLElementTagNameMap ? MathMLElementTagNameMap[Tag]
  : globalThis.Element;

type WithRef<Name extends string, Props> = Props & {
  ref?: ClientRef<ElementForTag<Name> | null> | undefined;
};

/**
 * JSX namespace containing type definitions for JSX elements and attributes.
 */
export namespace JSX {
  type HtmlEventBindings = ClientEventList<Handler<any, any, any>>;

  interface AriaAttributes {
    // ARIA attributes
    "aria-activedescendant"?: string | undefined;
    "aria-atomic"?: boolean | "false" | "true" | undefined;
    "aria-autocomplete"?: "none" | "inline" | "list" | "both" | undefined;
    "aria-busy"?: boolean | "false" | "true" | undefined;
    "aria-checked"?: boolean | "false" | "mixed" | "true" | undefined;
    "aria-colcount"?: number | undefined;
    "aria-colindex"?: number | undefined;
    "aria-colspan"?: number | undefined;
    "aria-controls"?: string | undefined;
    "aria-current"?:
      | boolean
      | "false"
      | "true"
      | "page"
      | "step"
      | "location"
      | "date"
      | "time"
      | undefined;
    "aria-describedby"?: string | undefined;
    "aria-details"?: string | undefined;
    "aria-disabled"?: boolean | "false" | "true" | undefined;
    "aria-dropeffect"?:
      | "none"
      | "copy"
      | "execute"
      | "link"
      | "move"
      | "popup"
      | undefined; // deprecated
    "aria-errormessage"?: string | undefined;
    "aria-expanded"?: boolean | "false" | "true" | undefined;
    "aria-flowto"?: string | undefined;
    "aria-grabbed"?: boolean | "false" | "true" | undefined; // deprecated
    "aria-haspopup"?:
      | boolean
      | "false"
      | "true"
      | "menu"
      | "listbox"
      | "tree"
      | "grid"
      | "dialog"
      | undefined;
    "aria-hidden"?: boolean | "false" | "true" | undefined;
    "aria-invalid"?:
      | boolean
      | "false"
      | "true"
      | "grammar"
      | "spelling"
      | undefined;
    "aria-keyshortcuts"?: string | undefined;
    "aria-label"?: string | undefined;
    "aria-labelledby"?: string | undefined;
    "aria-level"?: number | undefined;
    "aria-live"?: "off" | "assertive" | "polite" | undefined;
    "aria-modal"?: boolean | "false" | "true" | undefined;
    "aria-multiline"?: boolean | "false" | "true" | undefined;
    "aria-multiselectable"?: boolean | "false" | "true" | undefined;
    "aria-orientation"?: "horizontal" | "vertical" | undefined;
    "aria-owns"?: string | undefined;
    "aria-placeholder"?: string | undefined;
    "aria-posinset"?: number | undefined;
    "aria-pressed"?: boolean | "false" | "mixed" | "true" | undefined;
    "aria-readonly"?: boolean | "false" | "true" | undefined;
    "aria-relevant"?:
      | "additions"
      | "additions text"
      | "all"
      | "removals"
      | "text"
      | undefined;
    "aria-required"?: boolean | "false" | "true" | undefined;
    "aria-roledescription"?: string | undefined;
    "aria-rowcount"?: number | undefined;
    "aria-rowindex"?: number | undefined;
    "aria-rowspan"?: number | undefined;
    "aria-selected"?: boolean | "false" | "true" | undefined;
    "aria-setsize"?: number | undefined;
    "aria-sort"?: "none" | "ascending" | "descending" | "other" | undefined;
    "aria-valuemax"?: number | undefined;
    "aria-valuemin"?: number | undefined;
    "aria-valuenow"?: number | undefined;
    "aria-valuetext"?: string | undefined;
  }

  // typed-html
  export interface HtmlTag extends FixiAttributes, AriaAttributes {
    // Ruwuter client additions
    on?: HtmlEventBindings | undefined;
  }
  export interface HtmlBodyTag {
    onAfterprint?: undefined | string;
    onBeforeprint?: undefined | string;
    onBeforeonload?: undefined | string;
    onBlur?: undefined | string;
    onError?: undefined | string;
    onFocus?: undefined | string;
    onHaschange?: undefined | string;
    onLoad?: undefined | string;
    onMessage?: undefined | string;
    onOffline?: undefined | string;
    onOnline?: undefined | string;
    onPagehide?: undefined | string;
    onPageshow?: undefined | string;
    onPopstate?: undefined | string;
    onRedo?: undefined | string;
    onResize?: undefined | string;
    onStorage?: undefined | string;
    onUndo?: undefined | string;
    onUnload?: undefined | string;
  }
  export interface HtmlTag {
    onContextmenu?: undefined | string;
    onKeydown?: undefined | string;
    onKeypress?: undefined | string;
    onKeyup?: undefined | string;
    onClick?: undefined | string;
    onDblclick?: undefined | string;
    onDrag?: undefined | string;
    onDragend?: undefined | string;
    onDragenter?: undefined | string;
    onDragleave?: undefined | string;
    onDragover?: undefined | string;
    onDragstart?: undefined | string;
    onDrop?: undefined | string;
    onMousedown?: undefined | string;
    onMousemove?: undefined | string;
    onMouseout?: undefined | string;
    onMouseover?: undefined | string;
    onMouseup?: undefined | string;
    onMousewheel?: undefined | string;
    onScroll?: undefined | string;
  }
  export interface FormEvents {
    onBlur?: undefined | string;
    onChange?: undefined | string;
    onFocus?: undefined | string;
    onFormchange?: undefined | string;
    onForminput?: undefined | string;
    onInput?: undefined | string;
    onInvalid?: undefined | string;
    onSelect?: undefined | string;
    onSubmit?: undefined | string;
  }
  export interface HtmlInputTag extends FormEvents {
    onChange?: undefined | string;
  }
  export interface HtmlFieldSetTag extends FormEvents {}
  export interface HtmlFormTag extends FormEvents {}
  export interface MediaEvents {
    onAbort?: undefined | string;
    onCanplay?: undefined | string;
    onCanplaythrough?: undefined | string;
    onDurationchange?: undefined | string;
    onEmptied?: undefined | string;
    onEnded?: undefined | string;
    onError?: undefined | string;
    onLoadeddata?: undefined | string;
    onLoadedmetadata?: undefined | string;
    onLoadstart?: undefined | string;
    onPause?: undefined | string;
    onPlay?: undefined | string;
    onPlaying?: undefined | string;
    onProgress?: undefined | string;
    onRatechange?: undefined | string;
    onReadystatechange?: undefined | string;
    onSeeked?: undefined | string;
    onSeeking?: undefined | string;
    onStalled?: undefined | string;
    onSuspend?: undefined | string;
    onTimeupdate?: undefined | string;
    onVolumechange?: undefined | string;
    onWaiting?: undefined | string;
  }
  export interface HtmlAudioTag extends MediaEvents {}
  export interface HtmlEmbedTag extends MediaEvents {}
  export interface HtmlImageTag extends MediaEvents {}
  export interface HtmlObjectTag extends MediaEvents {}
  export interface HtmlVideoTag extends MediaEvents {}

  export interface HtmlTag {
    accesskey?: string | undefined;
    class?: string | undefined;
    contenteditable?: string | undefined;
    dir?: string | undefined;
    hidden?: string | boolean | undefined;
    inert?: string | boolean | undefined;
    popover?: "auto" | "hint" | "manual";
    popovertarget?: string | undefined;
    popoveraction?: "close" | "open" | "toggle" | (string & {}) | undefined;
    id?: string | undefined;
    role?: string | undefined;
    lang?: string | undefined;
    draggable?: string | boolean | undefined;
    spellcheck?: string | boolean | undefined;
    style?: string | undefined;
    tabindex?: string | undefined;
    title?: string | undefined;
    translate?: string | boolean | undefined;
    children?: HtmlNode;
    dangerouslySetInnerHTML?: { __html: string } | undefined;
  }
  export interface HtmlAnchorTag extends HtmlTag {
    href?: string | undefined;
    target?: string | undefined;
    download?: string | undefined;
    ping?: string | undefined;
    rel?: string | undefined;
    media?: string | undefined;
    hreflang?: string | undefined;
    type?: string | undefined;
  }
  export interface HtmlAreaTag extends HtmlTag {
    alt?: string | undefined;
    coords?: string | undefined;
    shape?: string | undefined;
    href?: string | undefined;
    target?: string | undefined;
    ping?: string | undefined;
    rel?: string | undefined;
    media?: string | undefined;
    hreflang?: string | undefined;
    type?: string | undefined;
  }
  export interface HtmlAudioTag extends HtmlTag {
    src?: string | undefined;
    autobuffer?: string | undefined;
    autoplay?: string | undefined;
    loop?: string | undefined;
    controls?: string | undefined;
  }
  export interface BaseTag extends HtmlTag {
    href?: string | undefined;
    target?: string | undefined;
  }
  export interface HtmlQuoteTag extends HtmlTag {
    cite?: string | undefined;
  }
  export interface HtmlBodyTag extends HtmlTag {}
  export interface HtmlButtonTag extends HtmlTag {
    action?: string | undefined;
    autofocus?: string | undefined;
    disabled?: boolean | undefined;
    enctype?: string | undefined;
    commandfor?: string | undefined;
    command?:
      | "toggle-popover"
      | "show-popover"
      | "hide-popover"
      | "show-modal"
      | "close"
      | (string & {})
      | undefined;
    form?: string | undefined;
    method?: string | undefined;
    name?: string | undefined;
    novalidate?: string | boolean | undefined;
    target?: string | undefined;
    type?: string | undefined;
    value?: string | undefined;
  }
  export interface HtmlDataListTag extends HtmlTag {}
  export interface HtmlCanvasTag extends HtmlTag {
    width?: string | undefined;
    height?: string | undefined;
  }
  export interface HtmlTableColTag extends HtmlTag {
    span?: string | undefined;
  }
  export interface HtmlTableSectionTag extends HtmlTag {}
  export interface HtmlTableRowTag extends HtmlTag {}
  export interface DataTag extends HtmlTag {
    value?: string | undefined;
  }
  export interface HtmlEmbedTag extends HtmlTag {
    src?: string | undefined;
    type?: string | undefined;
    width?: string | undefined;
    height?: string | undefined;
    [anything: string]: unknown;
  }
  export interface HtmlFieldSetTag extends HtmlTag {
    disabled?: string | undefined;
    form?: string | undefined;
    name?: string | undefined;
  }
  export interface HtmlFormTag extends HtmlTag {
    "accept-charset"?: string | undefined;
    action?: string | undefined;
    autocomplete?: string | undefined;
    enctype?: string | undefined;
    method?: string | undefined;
    name?: string | undefined;
    novalidate?: string | boolean | undefined;
    target?: string | undefined;
  }

  export interface HtmlDialogTag extends HtmlTag {
    open?: boolean | undefined;
  }

  export interface HtmlHtmlTag extends HtmlTag {
    manifest?: string | undefined;
  }
  export interface HtmlIFrameTag extends HtmlTag {
    src?: string | undefined;
    srcdoc?: string | undefined;
    name?: string | undefined;
    sandbox?: string | undefined;
    seamless?: string | undefined;
    width?: string | undefined;
    height?: string | undefined;
  }
  export interface HtmlImageTag extends HtmlTag {
    alt?: string | undefined;
    src?: string | undefined;
    crossorigin?: string | undefined;
    usemap?: string | undefined;
    ismap?: string | undefined;
    width?: string | undefined;
    height?: string | undefined;
  }
  export interface HtmlInputTag extends HtmlTag {
    accept?: string | undefined;
    action?: string | undefined;
    alt?: string | undefined;
    autocomplete?: string | undefined;
    autofocus?: string | undefined;
    checked?: string | boolean | undefined;
    disabled?: string | boolean | undefined;
    enctype?: string | undefined;
    form?: string | undefined;
    height?: string | undefined;
    list?: string | undefined;
    max?: string | undefined;
    minlength?: number | undefined;
    maxlength?: number | undefined;
    method?: string | undefined;
    min?: string | undefined;
    multiple?: string | undefined;
    name?: string | undefined;
    novalidate?: string | boolean | undefined;
    pattern?: string | undefined;
    placeholder?: string | undefined;
    readonly?: string | undefined;
    required?: boolean | undefined;
    size?: string | undefined;
    src?: string | undefined;
    step?: string | undefined;
    target?: string | undefined;
    type?: string | undefined;
    value?: string | undefined;
    width?: string | undefined;
  }
  export interface HtmlModTag extends HtmlTag {
    cite?: string | undefined;
    datetime?: string | Date | undefined;
  }
  export interface KeygenTag extends HtmlTag {
    autofocus?: string | undefined;
    challenge?: string | undefined;
    disabled?: string | undefined;
    form?: string | undefined;
    keytype?: string | undefined;
    name?: string | undefined;
  }
  export interface HtmlLabelTag extends HtmlTag {
    form?: string | undefined;
    for?: string | undefined;
  }
  export interface HtmlLITag extends HtmlTag {
    value?: string | number | undefined;
  }
  export interface HtmlLinkTag extends HtmlTag {
    href?: string | undefined;
    crossorigin?: string | undefined;
    rel?: string | undefined;
    media?: string | undefined;
    hreflang?: string | undefined;
    type?: string | undefined;
    sizes?: string | undefined;
    integrity?: string | undefined;
  }
  export interface HtmlMapTag extends HtmlTag {
    name?: string | undefined;
  }
  export interface HtmlMetaTag extends HtmlTag {
    name?: string | undefined;
    httpEquiv?: string | undefined;
    content?: string | undefined;
    charset?: string | undefined;
  }
  export interface HtmlMeterTag extends HtmlTag {
    value?: string | number | undefined;
    min?: string | number | undefined;
    max?: string | number | undefined;
    low?: string | number | undefined;
    high?: string | number | undefined;
    optimum?: string | number | undefined;
  }
  export interface HtmlObjectTag extends HtmlTag {
    data?: string | undefined;
    type?: string | undefined;
    name?: string | undefined;
    usemap?: string | undefined;
    form?: string | undefined;
    width?: string | undefined;
    height?: string | undefined;
  }
  export interface HtmlOListTag extends HtmlTag {
    reversed?: string | undefined;
    start?: string | number | undefined;
  }
  export interface HtmlOptgroupTag extends HtmlTag {
    disabled?: string | undefined;
    label?: string | undefined;
  }
  export interface HtmlOptionTag extends HtmlTag {
    disabled?: string | undefined;
    label?: string | undefined;
    selected?: string | undefined;
    value?: string | undefined;
  }
  export interface HtmlOutputTag extends HtmlTag {
    for?: string | undefined;
    form?: string | undefined;
    name?: string | undefined;
  }
  export interface HtmlParamTag extends HtmlTag {
    name?: string | undefined;
    value?: string | undefined;
  }
  export interface HtmlProgressTag extends HtmlTag {
    value?: string | number | undefined;
    max?: string | number | undefined;
  }
  export interface HtmlCommandTag extends HtmlTag {
    type?: string | undefined;
    label?: string | undefined;
    icon?: string | undefined;
    disabled?: string | undefined;
    checked?: string | undefined;
    radiogroup?: string | undefined;
    default?: string | undefined;
  }
  export interface HtmlLegendTag extends HtmlTag {}
  export interface HtmlBrowserButtonTag extends HtmlTag {
    type?: string | undefined;
  }
  export interface HtmlMenuTag extends HtmlTag {
    type?: string | undefined;
    label?: string | undefined;
  }
  export interface HtmlScriptTag extends HtmlTag {
    src?: string | undefined;
    type?: string | undefined;
    nonce?: string | undefined;
    charset?: string | undefined;
    async?: boolean | undefined;
    defer?: boolean | undefined;
    crossorigin?: string | undefined;
    integrity?: string | undefined;
    text?: string | undefined;
  }
  export interface HtmlDetailsTag extends HtmlTag {
    open?: boolean | undefined;
  }
  export interface HtmlSelectTag extends HtmlTag {
    autofocus?: string | undefined;
    disabled?: string | undefined;
    form?: string | undefined;
    multiple?: string | undefined;
    name?: string | undefined;
    required?: string | undefined;
    size?: string | undefined;
  }
  export interface HtmlSourceTag extends HtmlTag {
    src?: string | undefined;
    type?: string | undefined;
    media?: string | undefined;
  }
  export interface HtmlStyleTag extends HtmlTag {
    media?: string | undefined;
    type?: string | undefined;
    disabled?: string | undefined;
    scoped?: string | undefined;
  }
  export interface HtmlTableTag extends HtmlTag {}
  export interface HtmlTableDataCellTag extends HtmlTag {
    colspan?: string | number | undefined;
    rowspan?: string | number | undefined;
    headers?: string | undefined;
  }
  export interface HtmlTextAreaTag extends HtmlTag {
    autofocus?: string | undefined;
    cols?: string | undefined;
    dirname?: string | undefined;
    disabled?: string | undefined;
    form?: string | undefined;
    maxlength?: string | undefined;
    minlength?: string | undefined;
    name?: string | undefined;
    placeholder?: string | undefined;
    readonly?: boolean | undefined;
    required?: boolean | undefined;
    rows?: string | undefined;
    wrap?: string | undefined;
  }
  export interface HtmlTableHeaderCellTag extends HtmlTag {
    colspan?: string | number | undefined;
    rowspan?: string | number | undefined;
    headers?: string | undefined;
    scope?: string | undefined;
  }
  export interface HtmlTimeTag extends HtmlTag {
    datetime?: string | Date | undefined;
  }
  export interface HtmlTrackTag extends HtmlTag {
    default?: string | undefined;
    kind?: string | undefined;
    label?: string | undefined;
    src?: string | undefined;
    srclang?: string | undefined;
  }
  export interface HtmlVideoTag extends HtmlTag {
    src?: string | undefined;
    poster?: string | undefined;
    autobuffer?: string | undefined;
    autoplay?: string | undefined;
    loop?: string | undefined;
    controls?: string | undefined;
    width?: string | undefined;
    height?: string | undefined;
  }
  export interface HtmlSvgTag extends HtmlTag {
    xmlns?: string | undefined;
    fill?: string | undefined;
    viewBox?: string | undefined;
    "stroke-width"?: string | undefined;
    stroke?: string | undefined;
    class?: string | undefined;
    width?: number | undefined;
    height?: number | undefined;
  }

  export interface HtmlFeTurbulenceTag extends HtmlTag {
    type?: string | undefined;
    baseFrequency?: string | undefined;
    numOctaves?: string | undefined;
  }

  export interface HtmlFeDisplacementMapTag extends HtmlTag {
    in?: string | undefined;
    scale?: string | undefined;
  }

  export interface HtmlPathTag extends HtmlTag {
    "stroke-linecap"?: string | undefined;
    "stroke-linejoin"?: string | undefined;
    d?: string | undefined;
  }

  export type Element = Html;

  export type HtmlNode =
    | Element
    | ClientRef<any>
    | string
    | number
    | null
    | undefined
    | false
    | HtmlNode[];

  export interface ElementChildrenAttribute {
    children?: HtmlNode;
  }
  export interface IntrinsicElements {
    a: WithRef<"a", HtmlAnchorTag>;
    abbr: WithRef<"abbr", HtmlTag>;
    address: WithRef<"address", HtmlTag>;
    area: WithRef<"area", HtmlAreaTag>;
    article: WithRef<"article", HtmlTag>;
    aside: WithRef<"aside", HtmlTag>;
    audio: WithRef<"audio", HtmlAudioTag>;
    b: WithRef<"b", HtmlTag>;
    bb: WithRef<"bb", HtmlBrowserButtonTag>;
    base: WithRef<"base", BaseTag>;
    bdi: WithRef<"bdi", HtmlTag>;
    bdo: WithRef<"bdo", HtmlTag>;
    blockquote: WithRef<"blockquote", HtmlQuoteTag>;
    body: WithRef<"body", HtmlBodyTag>;
    br: WithRef<"br", HtmlTag>;
    button: WithRef<"button", HtmlButtonTag>;
    canvas: WithRef<"canvas", HtmlCanvasTag>;
    caption: WithRef<"caption", HtmlTag>;
    cite: WithRef<"cite", HtmlTag>;
    code: WithRef<"code", HtmlTag>;
    col: WithRef<"col", HtmlTableColTag>;
    colgroup: WithRef<"colgroup", HtmlTableColTag>;
    commands: WithRef<"commands", HtmlCommandTag>;
    data: WithRef<"data", DataTag>;
    datalist: WithRef<"datalist", HtmlDataListTag>;
    dd: WithRef<"dd", HtmlTag>;
    del: WithRef<"del", HtmlModTag>;
    details: WithRef<"details", HtmlDetailsTag>;
    summary: WithRef<"summary", HtmlTag>;
    dfn: WithRef<"dfn", HtmlTag>;
    div: WithRef<"div", HtmlTag>;
    dl: WithRef<"dl", HtmlTag>;
    dt: WithRef<"dt", HtmlTag>;
    em: WithRef<"em", HtmlTag>;
    embed: WithRef<"embed", HtmlEmbedTag>;
    fieldset: WithRef<"fieldset", HtmlFieldSetTag>;
    figcaption: WithRef<"figcaption", HtmlTag>;
    figure: WithRef<"figure", HtmlTag>;
    footer: WithRef<"footer", HtmlTag>;
    form: WithRef<"form", HtmlFormTag>;
    dialog: WithRef<"dialog", HtmlDialogTag>;
    h1: WithRef<"h1", HtmlTag>;
    h2: WithRef<"h2", HtmlTag>;
    h3: WithRef<"h3", HtmlTag>;
    h4: WithRef<"h4", HtmlTag>;
    h5: WithRef<"h5", HtmlTag>;
    h6: WithRef<"h6", HtmlTag>;
    head: WithRef<"head", HtmlTag>;
    header: WithRef<"header", HtmlTag>;
    hr: WithRef<"hr", HtmlTag>;
    html: WithRef<"html", HtmlHtmlTag>;
    i: WithRef<"i", HtmlTag>;
    iframe: WithRef<"iframe", HtmlIFrameTag>;
    img: WithRef<"img", HtmlImageTag>;
    input: WithRef<"input", HtmlInputTag>;
    ins: WithRef<"ins", HtmlModTag>;
    kbd: WithRef<"kbd", HtmlTag>;
    keygen: WithRef<"keygen", KeygenTag>;
    label: WithRef<"label", HtmlLabelTag>;
    legend: WithRef<"legend", HtmlLegendTag>;
    hgroup: WithRef<"hgroup", HtmlTag>;
    li: WithRef<"li", HtmlLITag>;
    link: WithRef<"link", HtmlLinkTag>;
    main: WithRef<"main", HtmlTag>;
    map: WithRef<"map", HtmlMapTag>;
    mark: WithRef<"mark", HtmlTag>;
    menu: WithRef<"menu", HtmlMenuTag>;
    meta: WithRef<"meta", HtmlMetaTag>;
    meter: WithRef<"meter", HtmlMeterTag>;
    nav: WithRef<"nav", HtmlTag>;
    noscript: WithRef<"noscript", HtmlTag>;
    object: WithRef<"object", HtmlObjectTag>;
    ol: WithRef<"ol", HtmlOListTag>;
    optgroup: WithRef<"optgroup", HtmlOptgroupTag>;
    option: WithRef<"option", HtmlOptionTag>;
    output: WithRef<"output", HtmlOutputTag>;
    p: WithRef<"p", HtmlTag>;
    param: WithRef<"param", HtmlParamTag>;
    pre: WithRef<"pre", HtmlTag>;
    progress: WithRef<"progress", HtmlProgressTag>;
    q: WithRef<"q", HtmlQuoteTag>;
    rb: WithRef<"rb", HtmlTag>;
    rp: WithRef<"rp", HtmlTag>;
    rt: WithRef<"rt", HtmlTag>;
    rtc: WithRef<"rtc", HtmlTag>;
    ruby: WithRef<"ruby", HtmlTag>;
    s: WithRef<"s", HtmlTag>;
    samp: WithRef<"samp", HtmlTag>;
    script: WithRef<"script", HtmlScriptTag>;
    section: WithRef<"section", HtmlTag>;
    select: WithRef<"select", HtmlSelectTag>;
    small: WithRef<"small", HtmlTag>;
    source: WithRef<"source", HtmlSourceTag>;
    span: WithRef<"span", HtmlTag>;
    strong: WithRef<"strong", HtmlTag>;
    style: WithRef<"style", HtmlStyleTag>;
    sub: WithRef<"sub", HtmlTag>;
    sup: WithRef<"sup", HtmlTag>;
    table: WithRef<"table", HtmlTableTag>;
    tbody: WithRef<"tbody", HtmlTag>;
    td: WithRef<"td", HtmlTableDataCellTag>;
    template: WithRef<"template", HtmlTag>;
    textarea: WithRef<"textarea", HtmlTextAreaTag>;
    tfoot: WithRef<"tfoot", HtmlTableSectionTag>;
    th: WithRef<"th", HtmlTableHeaderCellTag>;
    thead: WithRef<"thead", HtmlTableSectionTag>;
    time: WithRef<"time", HtmlTimeTag>;
    title: WithRef<"title", HtmlTag>;
    tr: WithRef<"tr", HtmlTableRowTag>;
    track: WithRef<"track", HtmlTrackTag>;
    u: WithRef<"u", HtmlTag>;
    ul: WithRef<"ul", HtmlTag>;
    var: WithRef<"var", HtmlTag>;
    video: WithRef<"video", HtmlVideoTag>;
    wbr: WithRef<"wbr", HtmlTag>;
    svg: WithRef<"svg", HtmlSvgTag>;
    path: WithRef<"path", HtmlPathTag>;
    filter: WithRef<"filter", HtmlSvgTag>;
    feTurbulence: WithRef<"feTurbulence", HtmlFeTurbulenceTag>;
    feDisplacementMap: WithRef<"feDisplacementMap", HtmlFeDisplacementMapTag>;
  }
}
