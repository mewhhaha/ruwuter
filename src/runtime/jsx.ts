import type { Html } from "./node.ts";
import type { FixiAttributes } from "./fixi.ts";
import type { Handler, Ref as ClientRef } from "../components/client.ts";
import type { ClientEventList } from "../events.ts";

/**
 * JSX namespace containing type definitions for JSX elements and attributes.
 */
export namespace JSX {
  type HtmlEventBindings = ClientEventList<Handler>;

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
  export interface HtmlTag
    extends FixiAttributes, AriaAttributes {
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
  export interface HtmlTableSectionTag
    extends HtmlTag {}
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
  export interface HtmlBrowserButtonTag
    extends HtmlTag {
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
  export interface HtmlTableDataCellTag
    extends HtmlTag {
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
  export interface HtmlTableHeaderCellTag
    extends HtmlTag {
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

  export interface HtmlFeDisplacementMapTag
    extends HtmlTag {
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
    a: HtmlAnchorTag;
    abbr: HtmlTag;
    address: HtmlTag;
    area: HtmlAreaTag;
    article: HtmlTag;
    aside: HtmlTag;
    audio: HtmlAudioTag;
    b: HtmlTag;
    bb: HtmlBrowserButtonTag;
    base: BaseTag;
    bdi: HtmlTag;
    bdo: HtmlTag;
    blockquote: HtmlQuoteTag;
    body: HtmlBodyTag;
    br: HtmlTag;
    button: HtmlButtonTag;
    canvas: HtmlCanvasTag;
    caption: HtmlTag;
    cite: HtmlTag;
    code: HtmlTag;
    col: HtmlTableColTag;
    colgroup: HtmlTableColTag;
    commands: HtmlCommandTag;
    data: DataTag;
    datalist: HtmlDataListTag;
    dd: HtmlTag;
    del: HtmlModTag;
    details: HtmlDetailsTag;
    summary: HtmlTag;
    dfn: HtmlTag;
    div: HtmlTag;
    dl: HtmlTag;
    dt: HtmlTag;
    em: HtmlTag;
    embed: HtmlEmbedTag;
    fieldset: HtmlFieldSetTag;
    figcaption: HtmlTag;
    figure: HtmlTag;
    footer: HtmlTag;
    form: HtmlFormTag;
    dialog: HtmlDialogTag;
    h1: HtmlTag;
    h2: HtmlTag;
    h3: HtmlTag;
    h4: HtmlTag;
    h5: HtmlTag;
    h6: HtmlTag;
    head: HtmlTag;
    header: HtmlTag;
    hr: HtmlTag;
    html: HtmlHtmlTag;
    i: HtmlTag;
    iframe: HtmlIFrameTag;
    img: HtmlImageTag;
    input: HtmlInputTag;
    ins: HtmlModTag;
    kbd: HtmlTag;
    keygen: KeygenTag;
    label: HtmlLabelTag;
    legend: HtmlLegendTag;
    hgroup: HtmlTag;
    li: HtmlLITag;
    link: HtmlLinkTag;
    main: HtmlTag;
    map: HtmlMapTag;
    mark: HtmlTag;
    menu: HtmlMenuTag;
    meta: HtmlMetaTag;
    meter: HtmlMeterTag;
    nav: HtmlTag;
    noscript: HtmlTag;
    object: HtmlObjectTag;
    ol: HtmlOListTag;
    optgroup: HtmlOptgroupTag;
    option: HtmlOptionTag;
    output: HtmlOutputTag;
    p: HtmlTag;
    param: HtmlParamTag;
    pre: HtmlTag;
    progress: HtmlProgressTag;
    q: HtmlQuoteTag;
    rb: HtmlTag;
    rp: HtmlTag;
    rt: HtmlTag;
    rtc: HtmlTag;
    ruby: HtmlTag;
    s: HtmlTag;
    samp: HtmlTag;
    script: HtmlScriptTag;
    section: HtmlTag;
    select: HtmlSelectTag;
    small: HtmlTag;
    source: HtmlSourceTag;
    span: HtmlTag;
    strong: HtmlTag;
    style: HtmlStyleTag;
    sub: HtmlTag;
    sup: HtmlTag;
    table: HtmlTableTag;
    tbody: HtmlTag;
    td: HtmlTableDataCellTag;
    template: HtmlTag;
    textarea: HtmlTextAreaTag;
    tfoot: HtmlTableSectionTag;
    th: HtmlTableHeaderCellTag;
    thead: HtmlTableSectionTag;
    time: HtmlTimeTag;
    title: HtmlTag;
    tr: HtmlTableRowTag;
    track: HtmlTrackTag;
    u: HtmlTag;
    ul: HtmlTag;
    var: HtmlTag;
    video: HtmlVideoTag;
    wbr: HtmlTag;
    svg: HtmlSvgTag;
    path: HtmlPathTag;
    filter: HtmlSvgTag;
    feTurbulence: HtmlFeTurbulenceTag;
    feDisplacementMap: HtmlFeDisplacementMapTag;
  }
}
