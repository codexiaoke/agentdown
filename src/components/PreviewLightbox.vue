<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

interface Props {
  open: boolean;
  title?: string;
  imageSrc?: string;
  imageAlt?: string;
  svg?: string;
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  imageSrc: '',
  imageAlt: '',
  svg: ''
});

const emit = defineEmits<{
  close: [];
  zoomIn: [];
  zoomOut: [];
  reset: [];
}>();

const scaleLabel = computed(() => `${Math.round(props.zoom * 100)}%`);
const stageRef = ref<HTMLDivElement | null>(null);
const panX = ref(0);
const panY = ref(0);
const isDragging = ref(false);
let activePointerId: number | null = null;
let lastPointerX = 0;
let lastPointerY = 0;

const isPannable = computed(() => Boolean(props.svg) || props.zoom > 1);

/** 每次打开预览、切换资源或回到 100% 时，视图回到中心。 */
function resetPan() {
  panX.value = 0;
  panY.value = 0;
  isDragging.value = false;
  activePointerId = null;
}

/** 预览打开时锁住 body 滚动，避免背景跟着跑。 */
function syncBodyScrollLock(open: boolean) {
  if (typeof document === 'undefined') {
    return;
  }

  document.body.style.overflow = open ? 'hidden' : '';
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close');
  }
}

function startPan(event: PointerEvent) {
  if (!isPannable.value || event.button !== 0) {
    return;
  }

  const stage = stageRef.value;

  if (!stage) {
    return;
  }

  activePointerId = event.pointerId;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  isDragging.value = true;
  stage.setPointerCapture(event.pointerId);
}

function movePan(event: PointerEvent) {
  if (!isDragging.value || activePointerId !== event.pointerId) {
    return;
  }

  const deltaX = event.clientX - lastPointerX;
  const deltaY = event.clientY - lastPointerY;
  lastPointerX = event.clientX;
  lastPointerY = event.clientY;
  panX.value += deltaX;
  panY.value += deltaY;
}

function endPan(event?: PointerEvent) {
  const stage = stageRef.value;

  if (event && stage && activePointerId === event.pointerId && stage.hasPointerCapture(event.pointerId)) {
    stage.releasePointerCapture(event.pointerId);
  }

  isDragging.value = false;
  activePointerId = null;
}

/** 鼠标滚轮直接映射到缩放，保持和工具栏按钮一致的步进。 */
function handleWheelZoom(event: WheelEvent) {
  if (event.deltaY === 0) {
    return;
  }

  const stepCount = Math.max(1, Math.round(Math.abs(event.deltaY) / 120));

  for (let index = 0; index < stepCount; index += 1) {
    if (event.deltaY < 0) {
      emit('zoomIn');
      continue;
    }

    emit('zoomOut');
  }
}

watch(
  () => props.open,
  (open) => {
    syncBodyScrollLock(open);

    if (typeof window === 'undefined') {
      return;
    }

    if (open) {
      resetPan();
      window.addEventListener('keydown', handleKeydown);
      return;
    }

    endPan();
    window.removeEventListener('keydown', handleKeydown);
  },
  {
    immediate: true
  }
);

watch(
  () => props.zoom,
  (zoom) => {
    if (zoom <= 1) {
      resetPan();
    }
  }
);

watch(
  () => [props.imageSrc, props.svg],
  () => {
    resetPan();
  }
);

onBeforeUnmount(() => {
  syncBodyScrollLock(false);
  endPan();

  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown);
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="agentdown-lightbox-transition">
      <div
        v-if="open"
        class="agentdown-lightbox"
        @click.self="emit('close')"
      >
        <div class="agentdown-lightbox-shell">
          <header class="agentdown-lightbox-toolbar">
            <div class="agentdown-lightbox-meta">
              <strong>{{ title || '预览' }}</strong>
              <span>{{ scaleLabel }}</span>
            </div>

            <div class="agentdown-lightbox-actions">
              <button
                type="button"
                class="agentdown-lightbox-button"
                :disabled="!canZoomOut"
                aria-label="缩小"
                title="缩小"
                @click="emit('zoomOut')"
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M4 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </button>

              <button
                type="button"
                class="agentdown-lightbox-button"
                aria-label="重置缩放"
                title="重置缩放"
                @click="emit('reset')"
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3.5 8a4.5 4.5 0 1 0 1.3-3.18"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M3.5 2.75v2.5H6"
                    stroke="currentColor"
                    stroke-width="1.4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>

              <button
                type="button"
                class="agentdown-lightbox-button"
                :disabled="!canZoomIn"
                aria-label="放大"
                title="放大"
                @click="emit('zoomIn')"
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 4v8M4 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
                </svg>
              </button>

              <button
                type="button"
                class="agentdown-lightbox-button"
                aria-label="关闭预览"
                title="关闭预览"
                @click="emit('close')"
              >
                <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>

          <div
            ref="stageRef"
            class="agentdown-lightbox-stage"
            :class="{
              'is-pannable': isPannable,
              'is-dragging': isDragging
            }"
            @pointerdown="startPan"
            @pointermove="movePan"
            @pointerup="endPan"
            @pointercancel="endPan"
            @wheel.prevent="handleWheelZoom"
          >
            <div
              class="agentdown-lightbox-viewport"
              :style="{ transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})` }"
            >
              <img
                v-if="imageSrc"
                class="agentdown-lightbox-image"
                :src="imageSrc"
                :alt="imageAlt"
              />

              <div
                v-else-if="svg"
                class="agentdown-lightbox-svg"
                v-html="svg"
              />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
