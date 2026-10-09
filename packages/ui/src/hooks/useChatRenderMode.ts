import { useProductModeStore } from '@/stores/useProductModeStore';
import { useUIStore, type ChatRenderMode } from '@/stores/useUIStore';

/**
 * The chat layout in effect. Work mode always groups a reply's steps (the
 * sorted layout) so tool calls do not fill the chat; the saved setting is the
 * Developer mode choice and switching modes never rewrites it.
 */
export const useChatRenderMode = (): ChatRenderMode => {
    const isWorkMode = useProductModeStore((state) => state.mode === 'work');
    const chatRenderMode = useUIStore((state) => state.chatRenderMode);
    return isWorkMode ? 'sorted' : chatRenderMode;
};
