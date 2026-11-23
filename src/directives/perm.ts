import type { Directive, DirectiveBinding } from 'vue';
import { useUserStore } from '@/stores/user';

const normalize = (value: string | string[]): string[] => (Array.isArray(value) ? value : [value]);

function allowed(binding: DirectiveBinding<string | string[]>): boolean {
  const store = useUserStore();
  const required = normalize(binding.value);
  return required.every((permission) => store.hasPerm(permission));
}

function apply(el: HTMLElement, binding: DirectiveBinding<string | string[]>): void {
  if (allowed(binding)) {
    if (el.dataset.permHidden === '1') {
      el.style.display = '';
      delete el.dataset.permHidden;
    }
    return;
  }
  if (el.parentNode) {
    el.parentNode.removeChild(el);
  } else {
    el.style.display = 'none';
    el.dataset.permHidden = '1';
  }
}

/**
 * v-perm="'campaign:create'"
 * 前端权限只控制可见性，写操作仍需后端二次校验（技术方案 5.4 / 6.4）。
 */
export const permDirective: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    apply(el, binding);
  },
  updated(el, binding) {
    apply(el, binding);
  }
};
