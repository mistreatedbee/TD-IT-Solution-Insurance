import { create } from 'zustand';

/** Lets a screen (the full-screen map) hide the floating tab bar while it is in immersive mode. */
export const useTabBarHidden = create<{ hidden: boolean; setHidden: (hidden: boolean) => void }>((set) => ({
  hidden: false,
  setHidden: (hidden) => set({ hidden }),
}));
