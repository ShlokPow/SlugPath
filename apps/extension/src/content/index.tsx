import { Panel } from './Panel'
import { createShadowMount } from './shadowMount'
import { injectAddToPlanButtons } from './scheduleInjection'
import { injectPrereqPopovers } from './prereqPopoverInjection'
import { injectGEBadges } from './geBadgeInjection'
import { SchedulePanel } from '../schedule/SchedulePanel'

// MyUCSC's my.ucsc.edu content script runs in every frame (manifest.config.ts
// sets all_frames: true there) because the class-search results grid isn't
// PeopleSoft-rendered at all — my.ucsc.edu's "Main Content" iframe navigates
// to a separate UCSC-built results page served from pisa.ucsc.edu, so that's
// the frame the row-button injectors actually need to run in (also listed in
// manifest.config.ts's matches). Panels must still only mount once per page,
// so UI mounting is gated on being the top frame; the injectors run in every
// frame and are a no-op wherever no results grid exists.
const isTopFrame = window.top === window

if (isTopFrame) {
  const { host: panelHost, root: panelRoot } = createShadowMount()
  document.documentElement.appendChild(panelHost)
  panelRoot.render(<Panel />)
}

if (location.hostname === 'my.ucsc.edu' && isTopFrame) {
  const { host: scheduleHost, root: scheduleRoot } = createShadowMount()
  scheduleHost.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;'
  document.documentElement.appendChild(scheduleHost)
  scheduleRoot.render(<SchedulePanel />)
}

if (location.hostname === 'my.ucsc.edu' || location.hostname === 'pisa.ucsc.edu') {
  void injectAddToPlanButtons(document)
  void injectPrereqPopovers(document)
  void injectGEBadges(document)
}
