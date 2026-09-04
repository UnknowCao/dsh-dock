/* dsh-dock client face (hand-written, zero build step).
 *
 * Turns the sidebar Settings row into a menu bar: this cell renders a trigger
 * that looks like a shell foot control (☰ 更多 ▴ wide, ☰ circle in the rail)
 * and opens a popup menu with two secondary buttons — 设置 (forwards the click
 * to the real — hidden but fully functional — Settings trigger) and 完全退出
 * (two-step arm, then POST /launcher/api/stop, death-probe, window.close,
 * fallback overlay).
 *
 * Docking: the seat is `sidebar.footer.action`; at mount the button relocates
 * into the sidebar foot container (footArea, a flex column under base class
 * rules — the rail alignSelf:center therefore does not depend on collapsed
 * state cascades) and the real Settings trigger is hidden via recorded inline
 * styles. Layout-effect cleanup restores both. Missing seat degrades to a
 * plain footer-action cell.
 *
 * Dismissal mirrors ui-primitives useDismissOnOutsidePointer: bubble-phase
 * document pointerdown outside the popup/trigger sets menuOpen false, and the
 * popup's DOM lifecycle is owned by the React effect — no manual DOM removal,
 * so state never desyncs.
 *
 * Chrome mirrors the Settings trigger (`.trigger` / `.trigger.rail`): same
 * width/height/radius/padding, hover fill, ink and font; the popup mirrors
 * the cordis panel surface tokens. All colors ride `--dsw-*`.
 *
 * Loader format matches the modules node half: a __ModuleLoader__ bundle whose
 * factory receives `require` for kernel-provided modules (react only here).
 */
window.__ModuleLoader__.load({
  id: 'dsh-dock',
  factory: (require) => {
    const React = require('react')

    const STOP_PATH = '/launcher/api/stop'
    const PROBE_INTERVAL_MS = 350
    // Imperceptible linger before the window closes after 完全退出: long
    // enough to read the "正在退出…" state, short enough to beat the
    // server's ~600ms death (no disconnect flash can paint).
    const CLOSE_GRACE_MS = 450
    const PROBE_CAP = 40 // ~14s of probing before giving up

    // Wide geometry: the settings trigger's own full-row chrome.
    const GEOM_WIDE = {
      width: 'calc(100% + 4px)',
      height: 42,
      margin: '4px -2px',
      borderRadius: 12,
      padding: '0 10px 0 8px',
      gap: 8,
    }
    // Rail geometry: the 36x36 circle box; alignSelf centers it in the flex
    // foot column regardless of collapsed-state class cascades.
    const GEOM_RAIL = {
      width: 36,
      height: 36,
      margin: '8px 0 10px',
      justifyContent: 'center',
      gap: 0,
      padding: 0,
      borderRadius: '50%',
      alignSelf: 'center',
    }

    const STYLE_BUTTON = {
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      boxSizing: 'border-box',
      border: 'none',
      background: 'transparent',
      cursor: 'pointer',
      overflow: 'hidden',
      color: 'var(--dsw-alias-label-primary)',
      fontFamily: 'inherit',
      fontSize: 14,
      lineHeight: '22px',
      whiteSpace: 'nowrap',
    }

    /** Feather "power" outline glyph, stroke-matched to the settings icons. */
    function PowerIcon({ size }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        React.createElement('path', { d: 'M18.36 6.64a9 9 0 1 1-12.73 0' }),
        React.createElement('line', { x1: '12', y1: '2', x2: '12', y2: '12' }),
      )
    }

    /** Feather "menu" (hamburger) glyph — the industry-standard menu mark. */
    function MenuIcon({ size }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        React.createElement('line', { x1: '3', y1: '6', x2: '21', y2: '6' }),
        React.createElement('line', { x1: '3', y1: '12', x2: '21', y2: '12' }),
        React.createElement('line', { x1: '3', y1: '18', x2: '21', y2: '18' }),
      )
    }

    // ── shutdown overlay (imperative DOM: fixed layer on document.body) ─────

    let overlayNode = null

    function removeOverlay() {
      if (overlayNode !== null && overlayNode.parentNode !== null) {
        overlayNode.parentNode.removeChild(overlayNode)
      }
      overlayNode = null
    }

    /** Full-viewport "server exited" notice with a close retry button. */
    function showExitedOverlay(retrying, setRetrying) {
      removeOverlay()
      const root = document.createElement('div')
      Object.assign(root.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--dsw-alias-bg-mask-1)',
        backdropFilter: 'var(--dsw-mask-blur)',
        fontFamily: 'var(--ds-font-family-ui, inherit)',
      })
      const card = document.createElement('div')
      Object.assign(card.style, {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        maxWidth: '360px',
        padding: '24px 28px',
        borderRadius: '16px',
        background: 'var(--dsw-alias-bg-layer-2)',
        boxShadow: 'var(--dsw-shadow-lv3)',
        color: 'var(--dsw-alias-label-primary)',
        textAlign: 'center',
        fontSize: '14px',
        lineHeight: '22px',
      })
      const title = document.createElement('div')
      title.textContent = '服务器已完全退出'
      Object.assign(title.style, {
        fontSize: '16px',
        fontWeight: '600',
        lineHeight: '24px',
      })
      const body = document.createElement('div')
      body.textContent = '会话已实时保存，可双击桌面「DSH Harness」快捷方式重新启动。'
      const closeButton = document.createElement('button')
      closeButton.type = 'button'
      closeButton.textContent = '关闭本窗口'
      Object.assign(closeButton.style, {
        height: '38px',
        padding: '0 18px',
        border: 'none',
        borderRadius: '12px',
        background: 'var(--dsw-alias-button-elevated-fill)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: '14px',
        cursor: 'pointer',
        marginTop: '6px',
      })
      closeButton.onclick = () => {
        window.close()
        window.setTimeout(() => {
          if (!window.closed) setRetrying(true)
        }, 400)
      }
      const hint = document.createElement('div')
      hint.textContent = retrying
        ? '浏览器拒绝了自动关闭，请直接关闭本窗口或标签页。'
        : '服务器已退出；本窗口正在尝试自动关闭…'
      Object.assign(hint.style, {
        fontSize: '12px',
        lineHeight: '18px',
        color: 'var(--dsw-alias-label-secondary)',
      })
      card.appendChild(title)
      card.appendChild(body)
      card.appendChild(closeButton)
      card.appendChild(hint)
      root.appendChild(card)
      document.body.appendChild(root)
      overlayNode = root
    }

    // ── menu popup (imperative DOM owned by the React effect) ───────────────

    let menuStylesInjected = false

    /** One shared stylesheet for the popup entrance animation. */
    function ensureMenuStyles() {
      if (menuStylesInjected || document.head === null) return
      menuStylesInjected = true
      const style = document.createElement('style')
      style.id = 'dsh-dock-menu-styles'
      style.textContent = [
        '@keyframes dsh-dock-menu-pop {',
        '  from { opacity: 0; transform: translateY(40px); }',
        '  to { opacity: 1; transform: none; }',
        '}',
        '.dsh-dock-menu-pop {',
        // mild ease-out-back: a small overshoot for a hint of elasticity.
        '  animation: dsh-dock-menu-pop 300ms cubic-bezier(0.34, 1.22, 0.64, 1);',
        '}',
      ].join('\n')
      document.head.appendChild(style)
    }

    /**
     * Build the popup panel above the trigger. The caller owns append/remove
     * and the dismissal listeners; this only creates content and returns the
     * node plus a label updater for the armed exit item.
     */
    function buildMenuPopup(trigger, onOpenSettings, onRestartClick, onExitClick, exitArmed, wide) {
      ensureMenuStyles()
      const rect = trigger.getBoundingClientRect()
      const root = document.createElement('div')
      root.setAttribute('role', 'menu')
      root.classList.add('dsh-dock-menu-pop')
      // Wide: match the trigger row's live width so the popup reads as the
      // same column. Rail trigger is a 36px circle — fall back to 216px.
      const width = wide ? Math.max(180, Math.round(rect.width)) : 216
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))
      Object.assign(root.style, {
        position: 'fixed',
        left: `${Math.round(left)}px`,
        bottom: `${Math.round(window.innerHeight - rect.top + 6)}px`,
        zIndex: '1500',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        width: `${width}px`,
        boxSizing: 'border-box',
        padding: '6px',
        border: '1px solid var(--dsw-alias-border-inverted)',
        borderRadius: '12px',
        background: 'var(--dsw-specific-menu)',
        boxShadow: 'var(--dsw-shadow-lv3)',
      })
      const mkItem = (iconSvg, text, onclick) => {
        const item = document.createElement('div')
        item.setAttribute('role', 'menuitem')
        item.tabIndex = 0
        Object.assign(item.style, {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          height: '40px',
          padding: '0 12px',
          borderRadius: '10px',
          color: 'var(--dsw-alias-label-primary)',
          fontSize: '14px',
          lineHeight: '22px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        })
        const icon = document.createElement('span')
        icon.style.display = 'inline-flex'
        icon.innerHTML = iconSvg
        item.appendChild(icon.firstChild)
        const label = document.createElement('span')
        label.textContent = text
        label.style.flex = '1'
        item.appendChild(label)
        item.onmouseenter = () => { item.style.background = 'var(--dsw-alias-interactive-bg-hover)' }
        item.onmouseleave = () => { item.style.background = 'transparent' }
        item.onclick = onclick
        item.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onclick()
          }
        }
        return item
      }
      const settingsItem = mkItem(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        '设置',
        onOpenSettings,
      )
      const restartItem = mkItem(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
        '重启/刷新',
        onRestartClick,
      )
      const exitItem = mkItem(
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>',
        exitArmed ? '确认完全退出?' : '完全退出',
        onExitClick,
      )
      root.appendChild(settingsItem)
      root.appendChild(restartItem)
      root.appendChild(exitItem)
      return {
        root,
        setExitArmed: (armed) => {
          const label = exitItem.lastChild
          if (label !== null && label.nodeType === 1) {
            label.textContent = armed ? '确认完全退出?' : '完全退出'
          }
        },
      }
    }

    function MenuCell(props) {
      const wide = Boolean(props.wide)
      const [phase, setPhase] = React.useState('idle') // idle | exiting | manual
      const [retrying, setRetrying] = React.useState(false)
      const [menuOpen, setMenuOpen] = React.useState(false)
      const [hovered, setHovered] = React.useState(false)
      const buttonRef = React.useRef(null)
      const dockRef = React.useRef(null) // { parent, next, settingsTrigger, beforeDisplay }

      // Dock into the foot container and hide the real trigger (restored on
      // unmount). footArea is a flex column under base class rules, so the
      // rail alignSelf:center is guaranteed without collapsed-state cascades.
      React.useLayoutEffect(() => {
        const button = buttonRef.current
        if (button === null || dockRef.current !== null) return
        const seat = document.querySelector('[data-slot="sidebar.settings"]')
        if (seat === null) return // no settings seat: stay a footer-action cell
        const settingsArea = seat.parentElement
        const footArea = settingsArea !== null ? settingsArea.parentElement : null
        const settingsTrigger = seat.querySelector('button')
        if (footArea === null || settingsTrigger === null) return
        dockRef.current = {
          parent: button.parentNode,
          next: button.nextSibling,
          settingsTrigger,
          beforeDisplay: settingsTrigger.style.display,
        }
        settingsTrigger.style.display = 'none'
        footArea.appendChild(button)
        return () => {
          const dock = dockRef.current
          if (dock === null) return
          dock.settingsTrigger.style.display = dock.beforeDisplay
          try {
            dock.parent.insertBefore(button, dock.next)
          } catch { /* node already detached */ }
          dockRef.current = null
        }
      }, [])

      // While exiting: let the "正在退出…" state linger imperceptibly
      // (~CLOSE_GRACE_MS, before the server dies and the app can paint a
      // disconnect flash), then close the window. If the browser blocks the
      // close, fall back to probing the server's death and retrying.
      React.useEffect(() => {
        if (phase !== 'exiting') return
        const grace = window.setTimeout(() => {
          window.close()
        }, CLOSE_GRACE_MS)
        const guard = window.setTimeout(() => {
          if (window.closed) return
          // Auto-close was blocked (plain tab): wait out the server's death,
          // then retry the close; show the manual overlay if still blocked.
          let tries = 0
          const probe = () => {
            tries += 1
            // 2.5s abort: a half-dead server can leave fetch pending forever.
            fetch(window.location.origin + '/', { cache: 'no-store', signal: AbortSignal.timeout(2500) })
              .then(() => {
                // Any HTTP answer means the server is still alive.
                if (tries < PROBE_CAP) window.setTimeout(probe, PROBE_INTERVAL_MS)
                else setPhase('idle') // stop never took effect; revert
              })
              .catch(() => {
                // Network failure: the server process is gone.
                window.close()
                window.setTimeout(() => {
                  if (!window.closed) setPhase('manual')
                }, 500)
              })
          }
          probe()
        }, CLOSE_GRACE_MS + 400)
        return () => {
          window.clearTimeout(grace)
          window.clearTimeout(guard)
        }
      }, [phase])

      // The exit overlay follows the manual phase (auto-close already tried).
      React.useEffect(() => {
        if (phase === 'manual') {
          showExitedOverlay(retrying, setRetrying)
          return removeOverlay
        }
        removeOverlay()
        return undefined
      }, [phase, retrying])

      // Menu lifecycle, state-driven (useDismissOnOutsidePointer pattern):
      // bubble-phase pointerdown outside popup+trigger closes via setState;
      // the effect alone appends/removes the popup DOM.
      React.useEffect(() => {
        if (!menuOpen) return undefined
        const trigger = buttonRef.current
        if (trigger === null) return undefined
        const dock = dockRef.current
        const armedRef = { current: false }
        const disarmTimer = { id: undefined }
        const popup = buildMenuPopup(
          trigger,
          () => { // 设置: forward to the real (hidden) settings trigger
            setMenuOpen(false)
            if (dock !== null) dock.settingsTrigger.click()
          },
          () => { // 重启: reload the interface — the same effect as the
            // browser's Ctrl+Shift+R hard-reload (page reloads and reconnects;
            // the server process itself keeps running).
            setMenuOpen(false)
            window.location.reload()
          },
          () => { // 完全退出: two-step arm, then run the exit flow
            if (!armedRef.current) {
              armedRef.current = true
              popup.setExitArmed(true)
              disarmTimer.id = window.setTimeout(() => {
                armedRef.current = false
                popup.setExitArmed(false)
              }, 4000)
              return
            }
            window.clearTimeout(disarmTimer.id)
            setMenuOpen(false)
            setPhase('exiting')
            // keepalive lets the request survive the page unload. The actual
            // close happens after a short imperceptible grace (see the exiting
            // effect): linger on "正在退出…", then close just before the
            // server dies (~600ms later) so no disconnect flash can paint.
            fetch(STOP_PATH, { method: 'POST', keepalive: true }).catch(() => {})
          },
          false,
          wide,
        )
        document.body.appendChild(popup.root)
        const onPointerDown = (event) => {
          if (event.target instanceof Node
            && !popup.root.contains(event.target)
            && !trigger.contains(event.target)) {
            setMenuOpen(false)
          }
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setMenuOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          window.clearTimeout(disarmTimer.id)
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
          if (popup.root.parentNode !== null) {
            popup.root.parentNode.removeChild(popup.root)
          }
        }
      }, [menuOpen, wide])

      const onTriggerClick = () => {
        if (phase === 'exiting' || phase === 'manual') return
        setMenuOpen(open => !open)
      }

      const active = menuOpen || phase === 'exiting'
      const title = '更多（设置 / 重启/刷新 / 完全退出）'
      const style = {
        ...STYLE_BUTTON,
        ...(wide ? GEOM_WIDE : GEOM_RAIL),
        background: hovered || active
          ? 'var(--dsw-alias-interactive-bg-hover)'
          : 'transparent',
      }
      // Up-pointing chevron: the popup opens upward from this trigger.
      const chevron = React.createElement(
        'span',
        {
          key: 'chevron',
          style: {
            marginLeft: 'auto',
            fontSize: 20,
            lineHeight: 1,
            color: 'var(--dsw-alias-label-tertiary)',
          },
        },
        '▴',
      )
      return React.createElement(
        'button',
        {
          ref: buttonRef,
          onClick: onTriggerClick,
          title,
          type: 'button',
          'aria-haspopup': 'menu',
          'aria-expanded': menuOpen ? 'true' : undefined,
          style,
          onPointerEnter: () => setHovered(true),
          onPointerLeave: () => setHovered(false),
        },
        wide
          ? [
            React.createElement(MenuIcon, { size: 16, key: 'icon' }),
            React.createElement('span', { key: 'label' }, '更多'),
            chevron,
          ]
          : React.createElement(MenuIcon, { size: 18, key: 'icon' }),
      )
    }

    return {
      name: 'dsh-dock',
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined) return
        slots.inject('sidebar.footer.action', () => slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'launcher-exit',
            order: 90,
            label: () => '更多菜单（设置 / 完全退出）',
          },
          (props) => React.createElement(MenuCell, props),
        ))
      },
    }
  },
})
