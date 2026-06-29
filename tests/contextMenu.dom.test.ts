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
