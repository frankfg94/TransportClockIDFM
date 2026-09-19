import { Comment, Fragment, Transition, defineComponent, h, isVNode, ref, type VNode } from "vue";

// Map coordinates already position every child. Unlike TransitionGroup,
// individual transitions do not measure every marker for FLIP move animations.
export default defineComponent({
  name: "MapItemTransitionGroup",
  props: {
    appear: Boolean,
    css: { type: Boolean, default: true },
    enterActiveClass: String,
    appearActiveClass: String,
    leaveActiveClass: String,
  },
  setup(props, { slots }) {
    const retained = new Map<NonNullable<VNode["key"]>, VNode>();
    let active = new Set<VNode["key"]>();
    const revision = ref(0);
    function children(nodes: VNode[]): VNode[] {
      return nodes.flatMap((node) => node.type === Fragment && Array.isArray(node.children)
        ? children(node.children.filter(isVNode))
        : node.type !== Comment ? [node] : []);
    }
    return () => {
      void revision.value;
      const current = children(slots.default?.() ?? []);
      active = new Set(current.map((child) => child.key));
      for (const child of current) {
        if (child.key != null) retained.set(child.key, child);
      }
      // Keep the Transition itself mounted until its child's leave completes.
      return h("div", [...retained].map(([key, child]) =>
        h(Transition, {
          ...props,
          key,
          onAfterLeave: () => {
            if (active.has(key)) return;
            retained.delete(key);
            revision.value++;
          },
        }, { default: () => active.has(key) ? child : null }),
      ));
    };
  },
});
