/* dsh-dock client face v0.5.0 (hand-written, zero build step).
 *
 * v0.5 — coexistence rewrite. v0.4.0 froze the page when another plugin
 * (e.g. the Cordis panel badge) inserted an entry into sidebar.footer.action:
 * MenuCell used to physically relocate its own button DOM into the sidebar
 * foot container and hide the native Settings trigger with inline styles,
 * so React's view of that subtree no longer matched the live DOM and any
 * later reflow of the footer action list deadlocked reconciliation.
 *
 * v0.5 rules, agreed with upstream:
 *   1. The native Settings row is untouched. dsh-dock registers as a plain
 *      `sidebar.footer.action` neighbor entry and renders exactly where the
 *      slot mounts it — no DOM relocation, no hidden triggers, ever.
 *   2. The menu shrinks to pure dock actions: Reload / Restart server /
 *      Full exit. (Settings lives where it always did.)
 *   3. The popup and the exit overlay are React portals (react-dom is a
 *      kernel-provided module): React owns their lifecycle end to end.
 *   4. Button geometry follows the slot's owner props (wide/rail) instead
 *      of hand-crafted trigger mimickry.
 *
 * The plugin's own settings page (tray residency / autostart) keeps its
 * official `settings.section` registration; the host half (tray, launcher
 * routes) is unchanged.
 *
 * Loader format matches the modules node half: a __ModuleLoader__ bundle whose
 * factory receives `require` for kernel-provided modules.
 */
window.__ModuleLoader__.load({
  id: 'dsh-dock',
  factory: (require) => {
    const React = require('react')
    const ReactDOM = require('react-dom')

    // ── i18n: the plugin's own chrome follows the harness display language ──
    // Strings live in a `dsh-dock` locale namespace registered through the
    // host's `locale` service (bind/register/subscribe). Components translate
    // at render time and re-render on a locale switch via the revision tick.
    // 「鲸湾」叙事：菜单是鲸鱼的休整湾，三个动作全部取自鲸类行为谱——
    // 换气（刷新页面）、洄游（重启服务器，去而必归）、归湾（完全退出休息）。
    const DICT_ZH = {
      'menu.trigger': '鲸湾',
      'menu.triggerTitle': '鲸湾 —— 换气（刷新界面）· 洄游（重启服务器）· 归湾（完全退出）',
      'menu.footerLabel': '鲸湾菜单（换气 / 洄游 / 归湾）',
      'menu.reload': '换气',
      'menu.reloadHint': '重载界面，服务器不动',
      'menu.restartServer': '洄游',
      'menu.restartHint': '重启服务器，就绪后自动开窗',
      'menu.fullExit': '归湾',
      'menu.fullExitHint': '停止服务器并关闭窗口',
      'menu.confirmFullExit': '确认归湾?',
      'section.title': 'DSH Dock（启动器）',
      'setting.trayStay': '托盘常驻',
      'setting.trayStayDesc': '双击桌面鲸鱼开窗后，鲸鱼驻留系统托盘：悬停显示服务器状态，左键秒开；关窗不停服。关闭则恢复开窗即退的短命行为。',
      'setting.autostart': '开机自启',
      'setting.autostartDesc': 'Windows 登录后静默驻留托盘并在后台预热服务器（不开窗），点托盘即开。写入当前用户注册表 Run 键，可随时关闭。',
      'setting.loading': '正在读取设置…',
      'setting.readError': '设置读取失败（插件路由不可用）',
      'setting.saveError': '保存失败，已还原',
      'overlay.title': '服务器已完全退出',
      'overlay.body': '会话已实时保存，可双击桌面「DSH Harness」快捷方式重新启动。',
      'overlay.close': '关闭本窗口',
      'overlay.hintTrying': '服务器已退出；本窗口正在尝试自动关闭…',
      'overlay.hintBlocked': '浏览器拒绝了自动关闭，请直接关闭本窗口或标签页。',
    }
    const DICT_EN = {
      'menu.trigger': 'Whale Bay',
      'menu.triggerTitle': 'Whale Bay — Surface (reload the page) · Migrate (restart the server) · To the Bay (full exit)',
      'menu.footerLabel': 'Whale Bay menu (Surface / Migrate / To the Bay)',
      'menu.reload': 'Surface',
      'menu.reloadHint': 'Reload the page; the server keeps running',
      'menu.restartServer': 'Migrate',
      'menu.restartHint': 'Restart the server; reopens when ready',
      'menu.fullExit': 'To the Bay',
      'menu.fullExitHint': 'Stop the server and close the window',
      'menu.confirmFullExit': 'Confirm: to the bay?',
      'section.title': 'DSH Dock (launcher)',
      'setting.trayStay': 'Tray residency',
      'setting.trayStayDesc': 'After the desktop whale opens a window, it stays in the notification area: hover shows the server state, left-click reopens instantly, closing the window never stops the server. Turn it off to restore the short-lived launcher behavior.',
      'setting.autostart': 'Start DSH on login',
      'setting.autostartDesc': 'After you sign in to Windows the whale sits in the tray and preheats the server in the background (no window); one click opens instantly. Written to the per-user Run key, can be turned off anytime.',
      'setting.loading': 'Loading settings…',
      'setting.readError': 'Failed to read settings (plugin routes unavailable)',
      'setting.saveError': 'Save failed — reverted',
      'overlay.title': 'Server has fully exited',
      'overlay.body': 'Sessions were saved in real time. Double-click the desktop "DSH Harness" shortcut to start again.',
      'overlay.close': 'Close this window',
      'overlay.hintTrying': 'The server exited; this window is trying to close itself…',
      'overlay.hintBlocked': 'The browser blocked the auto-close; please close this window or tab manually.',
    }
    // Locale-service handle + binding; set inside apply(), used at render time.
    let localeApi = null
    let localeBind = null
    /** Translate through the harness locale; fall back to zh until apply runs. */
    const t = (key, params) => {
      if (localeBind !== null) return localeBind(key, params)
      const text = DICT_ZH[key]
      return text === undefined ? key : text
    }
    /** Re-render tick on locale switches (also catches late dict registrations). */
    function useLocaleTick() {
      const [rev, setRev] = React.useState(0)
      React.useEffect(() => {
        if (localeApi === null) return undefined
        return localeApi.subscribe(() => setRev(r => r + 1))
      }, [])
      return rev
    }
    /** Pick a dictionary for one registered locale id (prefix match; unknown
     * locales are skipped — the harness fallback chain handles them). */
    const dictForLocale = (id) => {
      const base = String(id).split('-')[0].toLowerCase()
      if (base === 'zh') return DICT_ZH
      if (base === 'en') return DICT_EN
      return null
    }

    const STOP_PATH = '/launcher/api/stop'
    const PROBE_INTERVAL_MS = 350
    // Imperceptible linger before the window closes after 完全退出: long
    // enough to read the "正在退出…" state, short enough to beat the
    // server's ~600ms death (no disconnect flash can paint).
    const CLOSE_GRACE_MS = 450
    const PROBE_CAP = 40 // ~14s of probing before giving up

    // ── shared stylesheet (one inert <style> tag, id-guarded) ───────────────

    let stylesInjected = false

    /**
     * Styles for the dock. Two parts:
     *
     * 1. Slot stacking — the shell lays `sidebar.footer.action` entries out
     *    in a single horizontal flex row, but full-row entries like the
     *    Cordis panel badge (width:100%) leave no room for any neighbor, so
     *    a second entry is pushed out of the sidebar and becomes invisible.
     *    Stacking the slot anchor vertically (pure CSS over the structural
     *    [data-slot] attribute — no DOM is moved or restyled inline, React's
     *    view of the tree is untouched) lets every footer-action entry take
     *    its own row and coexist.
     * 2. Popup items and the entrance animation.
     */
    /**
     * Inject the shared stylesheet once. Returns the tag (or null when the
     * head is unavailable) so the caller's effect can remove it on dispose.
     */
    function ensureStyles() {
      if (stylesInjected || document.head === null) return null
      stylesInjected = true
      const style = document.createElement('style')
      style.id = 'dsh-dock-styles'
      style.textContent = [
        '[data-slot="sidebar.footer.action"]{',
        '  display: flex !important; /* override the inline display:contents */',
        '  flex-direction: column;',
        '  width: 100%;',
        '  align-items: stretch;',
        '  min-width: 0;',
        '}',
        '@keyframes dsh-dock-menu-pop {',
        '  from { opacity: 0; transform: translateY(40px); }',
        '  to { opacity: 1; transform: none; }',
        '}',
        '.dsh-dock-menu-pop {',
        // mild ease-out-back: a small overshoot for a hint of elasticity.
        '  animation: dsh-dock-menu-pop 300ms cubic-bezier(0.34, 1.22, 0.64, 1);',
        '}',
        '.dsh-dock-menu-item {',
        '  display: flex; align-items: center; gap: 8px;',
        '  height: 40px; padding: 0 12px; border-radius: 10px;',
        '  color: var(--dsw-alias-label-primary);',
        '  font-size: 14px; line-height: 22px;',
        '  cursor: pointer; white-space: nowrap;',
        '}',
        '.dsh-dock-menu-item:hover, .dsh-dock-menu-item:focus-visible {',
        '  background: var(--dsw-alias-interactive-bg-hover);',
        '  outline: none;',
        '}',
        '.dsh-dock-menu-item.dsh-dock-menu-item--armed {',
        '  color: var(--dsw-alias-label-danger, #e5484d);',
        '}',
        '.dsh-dock-menu-icon { display: inline-flex; flex: none; }',
      ].join('\n')
      document.head.appendChild(style)
      return style
    }

    /**
     * The 鲸湾 trigger mark: three rows of waves (Lucide "waves" geometry,
     * Feather-compatible strokes) — the bay itself, opening the scene where
     * the whale surfaces (wind), migrates (refresh-cw), and sleeps (moon).
     */
    function BayIcon({ size }) {
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
        React.createElement('path', { d: 'M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }),
        React.createElement('path', { d: 'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }),
        React.createElement('path', { d: 'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1' }),
      )
    }

    // Inline item glyphs — the marks compose one seascape: wind = 换气 (the
    // breath itself), refresh-cw = 洄游 (the migratory round trip), moon =
    // 归湾 (moor & sleep in the bay).
    const feather = (inner) => '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'
    // 换气: Feather "wind" — the breath itself, three streams of air.
    const ICON_RELOAD = feather('<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>')
    const ICON_RESTART = feather('<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>')
    const ICON_EXIT = feather('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>')

    // ── menu popup (React portal; React owns the whole lifecycle) ───────────

    /**
     * The popup panel above the trigger. Anchored to the live trigger rect at
     * open time; dismissed by Escape or an outside pointerdown. The exit item
     * arms for 4s (two-step confirm) before it fires.
     */
    function MenuPortal({ anchor, wide, onClose, onReload, onRestartServer, onExit }) {
      const [armed, setArmed] = React.useState(false)
      React.useEffect(() => {
        const onPointerDown = (event) => {
          if (event.target instanceof Node
            && !(event.target instanceof Element && event.target.closest('.dsh-dock-menu') !== null)
            && !anchor.contains(event.target)) {
            onClose()
          }
        }
        const onKeyDown = (event) => {
          if (event.key === 'Escape') onClose()
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKeyDown)
        }
      }, [anchor, onClose])
      // Two-step arm: disarm automatically after 4s of inaction.
      React.useEffect(() => {
        if (!armed) return undefined
        const id = window.setTimeout(() => setArmed(false), 4000)
        return () => window.clearTimeout(id)
      }, [armed])

      const rect = anchor.getBoundingClientRect()
      // Wide: match the trigger's live width so the popup reads as the same
      // column. Rail trigger is compact — fall back to 216px.
      const width = wide ? Math.max(180, Math.round(rect.width)) : 216
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))

      const item = (iconHtml, text, hint, onclick, danger, key) => React.createElement(
        'div',
        {
          key,
          role: 'menuitem',
          tabIndex: 0,
          // The metaphor stays pure in the menu; the native title tooltip
          // carries the functional legend on hover, at zero visual cost.
          title: hint,
          'aria-label': text + ' — ' + hint,
          className: 'dsh-dock-menu-item' + (danger ? ' dsh-dock-menu-item--armed' : ''),
          onClick: onclick,
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onclick()
            }
          },
        },
        React.createElement('span', {
          className: 'dsh-dock-menu-icon',
          dangerouslySetInnerHTML: { __html: iconHtml },
        }),
        React.createElement('span', { style: { flex: 1 } }, text),
      )

      return ReactDOM.createPortal(
        React.createElement(
          'div',
          {
            className: 'dsh-dock-menu dsh-dock-menu-pop',
            role: 'menu',
            style: {
              position: 'fixed',
              left: `${Math.round(left)}px`,
              bottom: `${Math.round(window.innerHeight - rect.top + 6)}px`,
              zIndex: 1500,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              width: `${width}px`,
              boxSizing: 'border-box',
              padding: 6,
              border: '1px solid var(--dsw-alias-border-inverted)',
              borderRadius: 12,
              background: 'var(--dsw-specific-menu)',
              boxShadow: 'var(--dsw-shadow-lv3)',
            },
          },
          item(ICON_RELOAD, t('menu.reload'), t('menu.reloadHint'), () => { onClose(); onReload() }, false, 'reload'),
          item(ICON_RESTART, t('menu.restartServer'), t('menu.restartHint'), () => { onClose(); onRestartServer() }, false, 'restart'),
          item(
            ICON_EXIT,
            armed ? t('menu.confirmFullExit') : t('menu.fullExit'),
            t('menu.fullExitHint'),
            () => { if (armed) { onClose(); onExit() } else setArmed(true) },
            armed,
            'exit',
          ),
        ),
        document.body,
      )
    }

    // ── exit overlay (React portal) ─────────────────────────────────────────

    /** Full-viewport "server exited" notice with a close retry button. */
    function ExitOverlayPortal({ retrying, onRetry }) {
      useLocaleTick() // re-render the overlay text on a harness language switch
      const overlay = React.createElement(
        'div',
        {
          style: {
            position: 'fixed',
            inset: 0,
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--dsw-alias-bg-mask-1)',
            backdropFilter: 'var(--dsw-mask-blur)',
            fontFamily: 'var(--ds-font-family-ui, inherit)',
          },
        },
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              maxWidth: 360,
              padding: '24px 28px',
              borderRadius: 16,
              background: 'var(--dsw-alias-bg-layer-2)',
              boxShadow: 'var(--dsw-shadow-lv3)',
              color: 'var(--dsw-alias-label-primary)',
              textAlign: 'center',
              fontSize: 14,
              lineHeight: '22px',
            },
          },
          React.createElement('div', {
            style: { fontSize: 16, fontWeight: 600, lineHeight: '24px' },
          }, t('overlay.title')),
          React.createElement('div', null, t('overlay.body')),
          React.createElement(
            'button',
            {
              type: 'button',
              style: {
                height: 38,
                padding: '0 18px',
                border: 'none',
                borderRadius: 12,
                background: 'var(--dsw-alias-button-elevated-fill)',
                color: 'var(--dsw-alias-label-primary)',
                fontSize: 14,
                cursor: 'pointer',
                marginTop: 6,
              },
              onClick: onRetry,
            },
            t('overlay.close'),
          ),
          React.createElement(
            'div',
            {
              style: {
                fontSize: 12,
                lineHeight: '18px',
                color: 'var(--dsw-alias-label-secondary)',
              },
            },
            retrying ? t('overlay.hintBlocked') : t('overlay.hintTrying'),
          ),
        ),
      )
      return ReactDOM.createPortal(overlay, document.body)
    }

    // ── dsh-dock settings page (a real page in the Settings dialog) ────────
    //
    // The plugin settings live as a proper settings.section entry — the same
    // seat every other plugin's settings page uses. Two toggles persisted via
    // /launcher/api/settings/{get,set} (host routes behind the same loopback
    // trust fence as the stop route).

    function SettingsToggleRow(props) {
      useLocaleTick() // re-render the row text on a harness language switch
      const [value, setValue] = React.useState(props.value)
      const [error, setError] = React.useState(undefined)
      React.useEffect(() => { setValue(props.value) }, [props.value])
      const onChange = (event) => {
        const next = event.target.checked
        setValue(next)
        setError(undefined)
        Promise.resolve(props.onToggle(next))
          .then(ok => {
            if (ok === false) { setValue(!next); setError(t('setting.saveError')) }
          })
          .catch(() => { setValue(!next); setError(t('setting.saveError')) })
      }
      return React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            minHeight: 44,
            padding: '4px 0',
          },
        },
        React.createElement('input', {
          type: 'checkbox',
          checked: value,
          onChange,
          style: {
            width: 16,
            height: 16,
            flex: 'none',
            accentColor: 'var(--dsw-alias-fill-accent, currentColor)',
          },
        }),
        React.createElement(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          React.createElement('div', {
            style: {
              color: 'var(--dsw-alias-label-primary)',
              fontSize: 14,
              lineHeight: '22px',
            },
          }, props.title),
          React.createElement('div', {
            style: {
              color: error !== undefined
                ? 'var(--dsw-alias-label-danger, #e5484d)'
                : 'var(--dsw-alias-label-secondary)',
              fontSize: 12,
              lineHeight: '18px',
            },
          }, error !== undefined ? error : props.description),
        ),
      )
    }

    function DockSettingsPage() {
      const [loaded, setLoaded] = React.useState(false)
      const [trayStay, setTrayStay] = React.useState(true)
      const [autostart, setAutostart] = React.useState(false)
      const [error, setError] = React.useState(undefined)
      React.useEffect(() => {
        let cancelled = false
        fetch('/launcher/api/settings/get', { method: 'POST', cache: 'no-store' })
          .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then(body => {
            if (cancelled || body === undefined || !body.ok) return
            setTrayStay(Boolean(body.trayStay))
            setAutostart(Boolean(body.autostart))
            setLoaded(true)
          })
          .catch(() => { if (!cancelled) setError(t('setting.readError')) })
        return () => { cancelled = true }
      }, [])
      const onToggle = (key) => (on) =>
        fetch('/launcher/api/settings/set', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [key]: on }),
          cache: 'no-store',
        })
          .then(r => {
            if (!r.ok) return false
            return r.json().then(body => {
              if (body === undefined || !body.ok) return false
              setTrayStay(Boolean(body.trayStay))
              setAutostart(Boolean(body.autostart))
              return true
            })
          })
      if (error !== undefined) {
        return React.createElement('div', {
          style: {
            color: 'var(--dsw-alias-label-secondary)',
            fontSize: 13,
            lineHeight: '20px',
            padding: '12px 0',
          },
        }, error)
      }
      if (!loaded) {
        return React.createElement('div', {
          style: {
            color: 'var(--dsw-alias-label-secondary)',
            fontSize: 13,
            padding: '12px 0',
          },
        }, t('setting.loading'))
      }
      return React.createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 } },
        React.createElement(SettingsToggleRow, {
          key: 'trayStay',
          value: trayStay,
          onToggle: onToggle('trayStay'),
          title: t('setting.trayStay'),
          description: t('setting.trayStayDesc'),
        }),
        React.createElement(SettingsToggleRow, {
          key: 'autostart',
          value: autostart,
          onToggle: onToggle('autostart'),
          title: t('setting.autostart'),
          description: t('setting.autostartDesc'),
        }),
      )
    }

    // ── the trigger cell (renders exactly where the slot mounts it) ─────────

    function MenuCell(props) {
      const wide = Boolean(props.wide)
      const [phase, setPhase] = React.useState('idle') // idle | exiting | manual
      const [menuOpen, setMenuOpen] = React.useState(false)
      const [hovered, setHovered] = React.useState(false)
      const [retrying, setRetrying] = React.useState(false)
      const localeRev = useLocaleTick() // re-render chrome on harness language switch
      const buttonRef = React.useRef(null)

      // While exiting: linger imperceptibly (~CLOSE_GRACE_MS, before the
      // server dies and the app can paint a disconnect flash), then close the
      // window. If the browser blocks the close, fall back to probing the
      // server's death and retrying; the overlay follows the manual phase.
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

      const restartServer = () => {
        // Ask the resident tray to run the full server restart
        // (marker -> kill -> respawn -> auto-open). The page dies with the
        // server and returns on the fresh boot.
        fetch('/launcher/api/restart', { method: 'POST', keepalive: true })
          .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
          .then(body => {
            if (body !== undefined && body.ok && body.accepted === false && body.note) {
              window.alert(body.note)
            }
          })
          .catch(() => {})
      }

      const fullExit = () => {
        setPhase('exiting')
        // keepalive lets the request survive the page unload. The actual
        // close happens after a short imperceptible grace (see the exiting
        // effect) so no disconnect flash can paint.
        fetch(STOP_PATH, { method: 'POST', keepalive: true }).catch(() => {})
      }

      const onTriggerClick = () => {
        if (phase === 'exiting' || phase === 'manual') return
        setMenuOpen(open => !open)
      }

      const active = menuOpen || phase === 'exiting'
      const title = t('menu.triggerTitle')
      // 「鲸湾」— the whale's rest-and-reset bay. Chrome mirrors the shell's
      // Settings trigger exactly (`.trigger` / `.trigger.rail`): same
      // width/height/radius/padding, hover fill, ink and font, so the two
      // rows read as one family. Rail keeps the 36px circle form.
      const button = React.createElement(
        'button',
        {
          key: 'trigger',
          ref: buttonRef,
          onClick: onTriggerClick,
          title,
          type: 'button',
          'aria-haspopup': 'menu',
          'aria-label': title,
          'aria-expanded': menuOpen ? 'true' : undefined,
          style: {
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: wide ? 'flex-start' : 'center',
            gap: wide ? 8 : 0,
            boxSizing: 'border-box',
            width: wide ? 'calc(100% + 4px)' : 36,
            height: wide ? 42 : 36,
            margin: wide ? '4px -2px' : '4px 0 2px',
            padding: wide ? '0 10px 0 8px' : 0,
            border: 'none',
            borderRadius: wide ? 12 : '50%',
            background: hovered || active
              ? 'var(--dsw-alias-interactive-bg-hover)'
              : 'transparent',
            cursor: 'pointer',
            overflow: 'hidden',
            color: 'var(--dsw-alias-label-primary)',
            fontFamily: 'inherit',
            fontSize: 14,
            lineHeight: '22px',
            whiteSpace: 'nowrap',
          },
          onPointerEnter: () => setHovered(true),
          onPointerLeave: () => setHovered(false),
        },
        React.createElement(BayIcon, { size: wide ? 16 : 18, key: 'icon' }),
        wide && React.createElement('span', { key: 'label' }, t('menu.trigger')),
      )

      return React.createElement(
        React.Fragment,
        null,
        button,
        menuOpen && buttonRef.current !== null && React.createElement(MenuPortal, {
          key: 'menu-' + localeRev,
          anchor: buttonRef.current,
          wide,
          onClose: () => setMenuOpen(false),
          onReload: () => window.location.reload(),
          onRestartServer: restartServer,
          onExit: fullExit,
        }),
        phase === 'manual' && React.createElement(ExitOverlayPortal, {
          key: 'exit-overlay',
          retrying,
          onRetry: () => {
            // Re-arm the hint per attempt so a later failure is visible as a
            // fresh "blocked" transition, not a permanently stuck one.
            setRetrying(false)
            window.close()
            window.setTimeout(() => {
              if (!window.closed) setRetrying(true)
            }, 400)
          },
        }),
      )
    }

    return {
      name: 'dsh-dock',
      // 'locale' is a hard dependency, not an optional get: dictionaries must
      // register before first render, so Cordis waits for the locale service
      // instead of silently falling back to the built-in zh strings (which
      // made the UI ignore harness language switches in <= v0.4).
      inject: ['slots', 'locale'],
      apply(ctx) {
        const slots = ctx.slots
        const locale = ctx.locale
        const disposers = []
        for (const def of locale.getLocale().locales) {
          const dict = dictForLocale(def.id)
          if (dict === null) continue // unknown locale: harness fallback chain covers it
          try {
            disposers.push(locale.register('dsh-dock', def.id, dict))
          } catch { /* duplicate or malformed id: fall back */ }
        }
        ctx.effect(() => () => {
          for (const dispose of disposers) { try { dispose() } catch { /* idempotent */ } }
          localeBind = null
          localeApi = null
        }, 'dsh-dock: locale dictionaries')
        localeApi = locale
        localeBind = locale.bind('dsh-dock')
        // The dock menu as a plain footer-action neighbor. No DOM relocation,
        // no hidden native triggers — the slot owns where this renders.
        // ensureStyles stacks the slot vertically so neighbors coexist; own
        // the <style> tag for the fiber so a dispose removes it.
        let stylesTag = ensureStyles()
        if (stylesTag !== null) {
          ctx.effect(() => () => {
            if (stylesTag !== null && stylesTag.parentNode !== null) stylesTag.parentNode.removeChild(stylesTag)
            stylesInjected = false
          }, 'dsh-dock: styles')
        }
        slots.inject('sidebar.footer.action', () => slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'launcher-exit',
            order: 90,
            label: () => t('menu.footerLabel'),
          },
          (props) => React.createElement(MenuCell, props),
        ))
        // The dsh-dock settings page inside the real Settings dialog — one
        // settings.section entry, exactly like other plugins' settings pages
        // (托盘常驻 / 开机自启).
        slots.inject('settings.section', () => slots.register(
          {
            name: 'settings.section',
            id: 'dsh-dock',
            order: 90,
            label: () => t('section.title'),
          },
          () => React.createElement(DockSettingsPage),
        ))
      },
    }
  },
})
