import type { iContentBlock } from '$lib/interface/iContentBlock.js';
import { writable } from 'svelte/store';

export const contentBlocks = writable([] as iContentBlock[]);
