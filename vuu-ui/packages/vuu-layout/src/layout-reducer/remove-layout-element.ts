/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { VuuShellLocation } from "@vuu-ui/vuu-utils";
import React, { ReactElement } from "react";
import {
  followPath,
  followPathToParent,
  getProp,
  getProps,
  nextStep,
  resetPath,
  typeOf,
} from "../utils";
import { createPlaceHolder } from "./flexUtils";
import { RemoveAction } from "./layoutTypes";
import { layoutFromJson } from "./layoutUtils";
import { swapChild } from "./replace-layout-element";

export function removeChild(layoutRoot: ReactElement, { path }: RemoveAction) {
  const target = followPath(layoutRoot, path!) as ReactElement;
  let targetParent = followPathToParent(layoutRoot, path!);
  if (targetParent === null) {
    return layoutRoot;
  }
  const { children } = getProps(targetParent);
  if (
    // this is very specific to explicitly sized components
    children.length > 1 &&
    typeOf(targetParent) !== "Stack" &&
    allOtherChildrenArePlaceholders(children, path)
  ) {
    const {
      style: { flexBasis, display, flexDirection, ...style },
    } = getProps(targetParent);
    let containerPath = getProp(targetParent, "path");
    let newLayout = swapChild(
      layoutRoot,
      targetParent,
      createPlaceHolder(containerPath, flexBasis, style),
    );
    while ((targetParent = followPathToParent(newLayout, containerPath))) {
      if (getProp(targetParent, "path") === "0") {
        break;
      }
      const { children } = getProps(targetParent);
      if (allOtherChildrenArePlaceholders(children)) {
        containerPath = getProp(targetParent, "path");
        const {
          style: { flexBasis, display, flexDirection, ...style },
        } = getProps(targetParent);
        newLayout = swapChild(
          layoutRoot,
          targetParent,
          createPlaceHolder(containerPath, flexBasis, style),
        );
      } else if (hasAdjacentPlaceholders(children)) {
        newLayout = collapsePlaceholders(
          layoutRoot,
          targetParent as ReactElement,
        );
      } else {
        break;
      }
    }
    return newLayout;
  }
  return _removeChild(layoutRoot, target);
}

function _removeChild(
  container: ReactElement,
  child: ReactElement,
): ReactElement {
  const props = getProps(container);
  const { children: componentChildren, path, preserve } = props;
  let { active, id: containerId } = props;
  const { idx, finalStep } = nextStep(path, getProp(child, "path"));
  const type = typeOf(container) as string;
  let children = componentChildren.slice() as ReactElement[];

  if (finalStep) {
    children.splice(idx, 1);

    if (active !== undefined && active >= idx) {
      active = Math.max(0, active - 1);
    }

    if (children.length === 0 && preserve && type === "Stack") {
      const {
        path,
        style: { flexBasis },
      } = getProps(child);
      const placeHolder =
        containerId === VuuShellLocation.Workspace
          ? layoutFromJson(
              {
                props: {
                  style: { flexGrow: 1, flexShrink: 1, flexBasis },
                  title: "Tab 1",
                },
                type: "Placeholder",
              },
              path,
            )
          : createPlaceHolder(path, flexBasis);
      children.push(placeHolder);
    } else if (
      children.length === 1 &&
      !preserve &&
      path !== "0" &&
      type.match(/Flexbox|Stack/)
    ) {
      return unwrap(container, children[0]);
    }

    if (!children.some(isFlexible) && children.some(canBeMadeFlexible)) {
      children = makeFlexible(children);
    }
  } else {
    children[idx] = _removeChild(children[idx], child) as ReactElement;
  }

  children = children.map((child, i) => resetPath(child, `${path}.${i}`));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return React.cloneElement(container, { active } as any, children);
}

function unwrap(container: ReactElement, child: ReactElement) {
  const type = typeOf(container);
  const {
    path,
    style: { flexBasis, flexGrow, flexShrink, width, height },
  } = getProps(container);

  let unwrappedChild = resetPath(child, path);
  if (path === "0") {
    unwrappedChild = React.cloneElement(unwrappedChild, {
      style: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(child.props as any).style,
        width,
        height,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  } else if (type === "Flexbox") {
    const dim =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (container.props as any).style.flexDirection === "column"
        ? "height"
        : "width";
    const {
      style: { [dim]: size, ...style },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } = unwrappedChild.props as any;
    unwrappedChild = React.cloneElement(unwrappedChild, {
      flexFill: undefined,
      style: {
        ...style,
        flexGrow,
        flexShrink,
        flexBasis,
        width,
        height,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }
  return unwrappedChild;
}

const isFlexible = (element: ReactElement) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (element.props as any).style?.flexGrow > 0;
};

const canBeMadeFlexible = (element: ReactElement) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((element.props as any).style) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { width, height, flexGrow } = (element.props as any).style;
    return (
      flexGrow === 0 && typeof width !== "number" && typeof height !== "number"
    );
  } else {
    return false;
  }
};

const makeFlexible = (children: ReactElement[]) => {
  return children.map((child) =>
    canBeMadeFlexible(child)
      ? React.cloneElement(child, {
          style: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(child.props as any).style,
            flexGrow: 1,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
      : child,
  );
};

const hasAdjacentPlaceholders = (children: ReactElement[]) => {
  if (children && children.length > 0) {
    let wasPlaceholder = getProp(children[0], "placeholder");
    let isPlaceholder = false;
    for (let i = 1; i < children.length; i++) {
      isPlaceholder = getProp(children[i], "placeholder");
      if (wasPlaceholder && isPlaceholder) {
        return true;
      }
      wasPlaceholder = isPlaceholder;
    }
  }
};

const collapsePlaceholders = (
  container: ReactElement,
  target: ReactElement,
) => {
  const { children: componentChildren, path } = getProps(container);
  const { idx, finalStep } = nextStep(path, getProp(target, "path"));
  let children = componentChildren.slice() as ReactElement[];
  if (finalStep) {
    children[idx] = _collapsePlaceHolders(target);
  } else {
    children[idx] = collapsePlaceholders(children[idx], target) as ReactElement;
  }

  children = children.map((child, i) => resetPath(child, `${path}.${i}`));
  return React.cloneElement(container, undefined, children);
};

const _collapsePlaceHolders = (container: ReactElement) => {
  const { children } = getProps(container);
  const newChildren = [];
  const placeholders: ReactElement[] = [];

  for (let i = 0; i < children.length; i++) {
    if (getProp(children[i], "placeholder")) {
      placeholders.push(children[i]);
    } else {
      if (placeholders.length === 1) {
        newChildren.push(placeholders.pop());
      } else if (placeholders.length > 0) {
        newChildren.push(mergePlaceholders(placeholders));
        placeholders.length = 0;
      }
      newChildren.push(children[i]);
    }
  }

  if (placeholders.length === 1) {
    newChildren.push(placeholders.pop());
  } else if (placeholders.length > 0) {
    newChildren.push(mergePlaceholders(placeholders));
  }

  const containerPath = getProp(container, "path");
  return React.cloneElement(
    container,
    undefined,
    newChildren.map((child, i) => resetPath(child, `${containerPath}.${i}`)),
  );
};

const mergePlaceholders = ([placeholder, ...placeholders]: ReactElement[]) => {
  const targetStyle = getProp(placeholder, "style");
  let { flexBasis, flexGrow, flexShrink } = targetStyle;
  for (const placeholder of placeholders) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { style } = placeholder.props as any;
    flexBasis += style.flexBasis;
    flexGrow = Math.max(flexGrow, style.flexGrow);
    flexShrink = Math.max(flexShrink, style.flexShrink);
  }
  return React.cloneElement(placeholder, {
    style: { ...targetStyle, flexBasis, flexGrow, flexShrink },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
};

const allOtherChildrenArePlaceholders = (
  children: ReactElement[],
  path?: string,
) =>
  children.every(
    (child) =>
      getProp(child, "placeholder") ||
      (path && getProp(child, "path") === path),
  );
