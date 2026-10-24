import { UserRound } from 'lucide-react'
import { usePersistentState } from '@renderer/hooks/usePersistentState'
import { ACCENTS } from '@renderer/lib/accents'
import { iconFor } from '@renderer/lib/icons'

/** Avatar + name in the top bar; opens Settings → Perfil. */
export function ProfileChip({ onOpen }: { onOpen: () => void }) {
  const [profile] = usePersistentState('profile', null)
  if (!profile?.name) {
    return (
      <button onClick={onOpen} title="Criar perfil" className="grid size-7 place-items-center rounded-full border border-dashed border-white/15 text-zinc-500 transition-colors hover:border-volt/50 hover:text-zinc-200">
        <UserRound className="size-3.5" />
      </button>
    )
  }
  const Icon = iconFor(profile.avatar.icon)
  return (
    <button onClick={onOpen} title="Perfil" className="flex items-center gap-2 rounded-full py-0.5 pr-2.5 pl-0.5 transition-colors hover:bg-white/[0.05]">
      <span className={`grid size-6 place-items-center rounded-full border ${ACCENTS[profile.avatar.accent].tone}`}>
        <Icon className="size-3.5" />
      </span>
      <span className="max-w-[120px] truncate font-sans text-[12px] text-zinc-300">{profile.name}</span>
    </button>
  )
}
