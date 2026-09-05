import { mount } from "@vue/test-utils";
import { defineComponent, nextTick, ref } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import ContextMenu from "../src/components/ContextMenu.vue";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ContextMenu", () => {
  it("renders slot content and closes on outside click or tap", async () => {
    const wrapper = mountHost();

    await nextTick();
    expect(document.body.querySelector(".test-context-menu")?.textContent).toBe(
      "Action",
    );

    document.body.dispatchEvent(new Event("click", { bubbles: true }));
    await nextTick();
    expect(wrapper.vm.open).toBe(false);

    wrapper.vm.open = true;
    await nextTick();

    document.body.dispatchEvent(new Event("touchstart", { bubbles: true }));
    await nextTick();
    expect(wrapper.vm.open).toBe(false);

    wrapper.unmount();
  });

  it("keeps the menu open when closeOnOutsideClick is disabled", async () => {
    const wrapper = mountHost({ closeOnOutsideClick: false });

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();

    expect(wrapper.vm.open).toBe(true);

    wrapper.unmount();
  });

  it("can render inside a fullscreen host", async () => {
    const Host = defineComponent({
      components: { ContextMenu },
      setup() {
        const open = ref(true);
        const anchor = ref<HTMLElement>();
        return { anchor, open };
      },
      template: `
        <div class="fullscreen-host">
          <button ref="anchor" type="button">Open</button>
        </div>
        <ContextMenu
          v-model:open="open"
          :anchor="anchor"
          teleport-to=".fullscreen-host"
          class="fullscreen-context-menu"
        >
          <button type="button">Action</button>
        </ContextMenu>
      `,
    });
    const wrapper = mount(Host, { attachTo: document.body });

    await nextTick();
    expect(document.querySelector(".fullscreen-host .fullscreen-context-menu")?.textContent).toBe("Action");

    wrapper.unmount();
  });

  it("positions a context menu from a fixed viewport point", async () => {
    const Host = defineComponent({
      components: { ContextMenu },
      setup() {
        const open = ref(true);
        return { open };
      },
      template: `
        <ContextMenu v-model:open="open" :point="{ x: 120, y: 80 }" class="point-context-menu">
          <button type="button">Action</button>
        </ContextMenu>
      `,
    });
    const wrapper = mount(Host, { attachTo: document.body });

    await nextTick();
    const menu = document.querySelector<HTMLElement>(".point-context-menu");
    expect(menu?.style.position).toBe("fixed");
    expect(menu?.style.left).toBe("120px");
    expect(menu?.style.top).toBe("88px");

    wrapper.unmount();
  });

  it("repositions when the fixed point arrives on the opening render", async () => {
    const Host = defineComponent({
      components: { ContextMenu },
      setup() {
        const open = ref(true);
        const point = ref<{ x: number; y: number }>();
        return { open, point };
      },
      template: `
        <ContextMenu v-model:open="open" :point="point" class="late-point-context-menu">
          <button type="button">Action</button>
        </ContextMenu>
      `,
    });
    const wrapper = mount(Host, { attachTo: document.body });

    await nextTick();
    wrapper.vm.point = { x: 220, y: 140 };
    await nextTick();
    await nextTick();

    const menu = document.querySelector<HTMLElement>(".late-point-context-menu");
    expect(menu?.style.position).toBe("fixed");
    expect(menu?.style.left).toBe("220px");
    expect(menu?.style.top).toBe("148px");

    wrapper.unmount();
  });
});

function mountHost(options: { closeOnOutsideClick?: boolean } = {}) {
  const Host = defineComponent({
    components: { ContextMenu },
    setup() {
      const open = ref(true);
      const anchor = ref<HTMLElement>();

      return {
        anchor,
        closeOnOutsideClick: options.closeOnOutsideClick ?? true,
        open,
      };
    },
    template: `
      <button ref="anchor" type="button">Open</button>
      <ContextMenu
        v-model:open="open"
        :anchor="anchor"
        class="test-context-menu"
        :close-on-outside-click="closeOnOutsideClick"
      >
        <button type="button">Action</button>
      </ContextMenu>
    `,
  });

  return mount(Host, { attachTo: document.body });
}
