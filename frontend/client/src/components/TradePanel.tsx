import type { Player, TradeOffer } from '../module_bindings/types';

type TradePanelProps = {
  players: readonly Player[];
  tradeOffers: readonly TradeOffer[];
  currentIdentity: string | null;
};

export default function TradePanel({ players, tradeOffers, currentIdentity }: TradePanelProps) {
  const onlineCount = players.filter(player => player.isOnline).length;
  const pendingCount = tradeOffers.filter(offer => offer.status === 'pending').length;

  return (
    <aside className="panel trade-panel">
      <button type="button">Trades</button>
      <div className="metric-row"><span>Online</span><strong>{onlineCount}</strong></div>
      <div className="metric-row"><span>Pending</span><strong>{pendingCount}</strong></div>
      <small>{currentIdentity ? 'Connected' : 'Connecting'}</small>
    </aside>
  );
}
