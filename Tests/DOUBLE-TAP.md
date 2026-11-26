# Reader gesture update (1.1.40, no version bump)

- Single touch no longer opens controls. Double tap within 320 ms / 32 px toggles controls.
- Mouse double-click also toggles controls; synthesized mouse events following touch are ignored.
- Dragging, pinch and cancelled touches do not open controls. Interactive buttons still use single tap.
- Removed persistent spread page counter and arrows, and bottom toolbar page counter. Swipe turns pages; 3D leaf animation remains.
- Removed navigation strip so pages occupy full reader height.

Validation: JavaScript syntax checks passed. Chromium fixture passed five viewport/page-size combinations, animation direction/lock/cleanup/motion-off, and all three reader modes' single/double tap, swipe and pinch rejection. Test results in reader-gesture-results.json and spread-layout-results.json. Native API adapter and bridge are byte-identical to previous source package.

This Linux environment cannot compile or run Xcode/iPad; native device gestures and IPA compilation remain unverified. Existing native authentication/network results are unchanged and were not re-run for this UI-only edit.
