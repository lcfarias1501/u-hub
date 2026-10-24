import { Cloud, CloudOff, Link2, Loader2, LogOut, RefreshCw, UserRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import type { SyncStatus } from '@shared/types'
import { AccountCard, ProviderBadge, useSocial } from '@renderer/components/AccountCard'
import { SettingRow } from '@renderer/components/Controls'
import { Panel } from '@renderer/components/Panel'

function Section({ id, title, icon, children }: { id: string; title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-6">
      <Panel title={title} icon={icon} hover={false} bodyClassName="divide-y divide-white/[0.05] px-4 py-2">
        {children}
      </Panel>
    </div>
  )
}

function ago(t: number | null): string {
  if (!t) return 'nunca'
  const m = Math.round((Date.now() - t) / 60_000)
  return m < 1 ? 'agora há pouco' : m < 60 ? `há ${m} min` : `há ${Math.round(m / 60)} h`
}

export function AccountSection() {
  const s = useSocial()
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [linking, setLinking] = useState(false)
  const [linkErr, setLinkErr] = useState<string | null>(null)

  useEffect(() => {
    void window.uhub.sync.status().then(setSync)
    return window.uhub.sync.onUpdate(setSync)
  }, [])

  if (!s) return null

  if (!s.signedIn) {
    return (
      <Section id="account" title="Conta U-Hub" icon={<UserRound />}>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8 py-5">
          <div className="space-y-3 text-[13px] leading-relaxed text-zinc-400">
            <p className="text-[15px] font-semibold text-zinc-100">Opcional — mas leva seu U-Hub com você.</p>
            <p>Com uma conta, suas configurações ficam salvas na nuvem e voltam sozinhas em outro computador: módulos, cores, atalhos, Quest Log, Launcher, rádios, playlists e lista de desejos.</p>
            <p>Também é com ela que você adiciona amigos e vê o que estão jogando.</p>
            <p className="text-[12px] text-zinc-500">Senhas e keys do Vault nunca vão para a nuvem. Para levá-las a outro computador, use Exportar backup (abaixo, em Dados & Sobre).</p>
          </div>
          <AccountCard compact />
        </div>
      </Section>
    )
  }

  const providers = s.account?.providers ?? []
  const hasEmail = providers.includes('email')
  const hasDiscord = providers.includes('discord')
  const syncLabel =
    !sync || sync.state === 'off'
      ? 'Desligada'
      : sync.state === 'syncing'
        ? 'Sincronizando…'
        : sync.state === 'conflict'
          ? 'Aguardando sua escolha'
          : sync.state === 'error'
            ? `Erro: ${sync.error}`
            : `Sincronizado ${ago(sync.lastSyncedAt)}`

  return (
    <Section id="account" title="Conta U-Hub" icon={<UserRound />}>
      <SettingRow
        title={s.me ? `${s.me.displayName} · @${s.me.username}` : 'Conta conectada'}
        description={s.account?.email ?? 'Conta via Discord'}
      >
        <button className="btn hover:!border-crit/40 hover:!text-rose-300" onClick={() => void window.uhub.social.signOut()}>
          <LogOut className="size-3.5" /> Sair
        </button>
      </SettingRow>
      <SettingRow
        title="Formas de entrar"
        description={
          <span className="mt-1 flex flex-wrap gap-1.5">
            <ProviderBadge on={hasEmail} label="E-mail e senha" />
            <ProviderBadge on={hasDiscord} label="Discord" />
            {linkErr && <span className="font-mono text-[10px] text-rose-300">{linkErr}</span>}
          </span>
        }
      >
        {!hasDiscord && (
          <button
            className="btn"
            disabled={linking}
            onClick={async () => {
              setLinking(true)
              setLinkErr(null)
              const r = await window.uhub.social.linkDiscord()
              setLinking(false)
              if (!r.ok) setLinkErr(r.error ?? 'Falhou')
            }}
          >
            {linking ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />} Vincular Discord
          </button>
        )}
      </SettingRow>
      <SettingRow
        title="Sincronização na nuvem"
        description={
          <>
            <span className={sync?.state === 'error' ? 'text-rose-300' : sync?.state === 'synced' ? 'text-acid-soft' : ''}>{syncLabel}</span>
            <br />
            Módulos, cores, atalhos, notificações, Quest Log, Launcher, rádios, playlists, categorias do Vault e lista de desejos. Senhas do Vault, tokens e histórico ficam só neste computador.
          </>
        }
      >
        <button className="btn" disabled={sync?.state === 'syncing'} onClick={() => void window.uhub.sync.now()}>
          {sync?.state === 'syncing' ? <Loader2 className="size-3.5 animate-spin" /> : sync?.state === 'error' ? <CloudOff className="size-3.5" /> : <RefreshCw className="size-3.5" />} Sincronizar agora
        </button>
      </SettingRow>
      <div className="flex items-center gap-2 py-3 text-[11px] text-zinc-500">
        <Cloud className="size-3.5 shrink-0" /> Para levar as senhas do Vault a outro computador: Dados & Sobre → Exportar backup (incluir o Vault, com senha) e importe lá.
      </div>
    </Section>
  )
}
