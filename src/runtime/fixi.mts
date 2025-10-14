/**
 * Event types supported by the Fixi framework.
 * @internal
 */
export interface FixiEvents {
  "fx:init": Event;
  "fx:inited": Event;
  "fx:process": Event;
  "fx:config": Event;
  "fx:before": Event;
  "fx:after": Event;
  "fx:error": Event;
  "fx:finally": Event;
  "fx:swapped": Event;
}

/**
 * HTML attributes for Fixi framework functionality.
 * @internal
 */
export interface FixiAttributes {
  "fx-action"?: string;
  "fx-method"?: "GET" | "POST" | "DELETE" | "PUT" | "PATCH";
  "fx-trigger"?: keyof FixiEvents | ({} & string);
  "fx-target"?: "body" | "self" | "parent" | "closest" | ({} & string);
  "fx-ignore"?: true;
  "fx-swap"?:
    | "innerHTML"
    | "outerHTML"
    | "afterbegin"
    | "beforebegin"
    | "beforeend"
    | "afterend"
    | ({} & string);
}

/**
 * Extends HTMLElement with Fixi attributes.
 * @internal
 */
export interface HTMLElement extends FixiAttributes {}

/**
 * Global event map for Fixi framework events.
 * @internal
 */
export interface GlobalEventMap {
  "fx:init": Event;
  "fx:inited": Event;
  "fx:process": Event;

  "fx:before": Event;
  "fx:after": Event;
  "fx:error": Event;
  "fx:finally": Event;
  "fx:swapped": Event;
}
