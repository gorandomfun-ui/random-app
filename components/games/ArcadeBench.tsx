'use client'

/**
 * The effects test page's bench for the games in the flow: the state kept on
 * the device, a game now, its level, a round ended won or lost at once, the
 * state from scratch. Only ever on the effects test page.
 */

import type { FlowState } from '@/lib/games/flow'
import type { GameName } from '@/lib/games/scores'

export default function ArcadeBench({ flow, onGame, onLevel, onFinish, onReset }: {
  flow: FlowState | null
  onGame: (game: GameName) => void
  onLevel: (game: GameName, delta: number) => void
  onFinish: (won: boolean) => void
  onReset: () => void
}) {
  return (
    <aside className="fixed bottom-2 left-2 z-40 max-w-[260px] rounded bg-black/85 px-3 py-2 font-mono text-[11px] leading-snug text-white">
      <div className="mb-1 font-bold">Jeux — banc d&apos;essai</div>
      {flow ? (
        <div className="mb-2 opacity-80">
          vus {flow.count} · prochain à {flow.nextAt} · refus {flow.refusals}{flow.stopped ? ' · arrêté' : ''}<br />
          suivant {flow.next}{flow.playing ? ` · en partie : ${flow.playing}` : ''}<br />
          catcher niv. {flow.runs.catcher?.level ?? 1} ({flow.runs.catcher?.score ?? 0}) · eater niv. {flow.runs.eater?.level ?? 1} ({flow.runs.eater?.score ?? 0}) · attacks niv. {flow.runs.attacks?.level ?? 1} ({flow.runs.attacks?.score ?? 0})
        </div>
      ) : <div className="mb-2 opacity-80">pas de stockage : pas de jeux</div>}
      <div className="flex flex-wrap gap-1">
        <button type="button" className="rounded bg-white/15 px-2 py-1" onClick={() => onGame('catcher')}>CATCHER maintenant</button>
        <button type="button" className="rounded bg-white/15 px-2 py-1" onClick={() => onGame('eater')}>EATER maintenant</button>
        <button type="button" className="rounded bg-white/15 px-2 py-1" onClick={() => onGame('attacks')}>ATTACKS maintenant</button>
        <button type="button" className="rounded bg-white/15 px-2 py-1" onClick={() => onLevel(flow?.next ?? 'catcher', 1)}>niveau +1</button>
        <button type="button" className="rounded bg-white/15 px-2 py-1" onClick={() => onLevel(flow?.next ?? 'catcher', -1)}>niveau −1</button>
        <button type="button" className="rounded bg-white/15 px-2 py-1" onClick={() => onFinish(true)}>gagner la manche</button>
        <button type="button" className="rounded bg-white/15 px-2 py-1" onClick={() => onFinish(false)}>perdre la manche</button>
        <button type="button" className="rounded bg-white/15 px-2 py-1" onClick={onReset}>remise à zéro</button>
      </div>
    </aside>
  )
}
