/**
 * Mock stock universe. Real integrations should resolve this list from the
 * selected quote channel instead of a hardcoded table.
 */

export type MarketProfile = 'strong' | 'up' | 'range' | 'pullback' | 'down'

export interface StockProfile {
  symbol: string
  name: string
  sector: string
  /** Approximate latest close price used as the anchor of the mock series. */
  basePrice: number
  /** Average daily volume in shares. */
  volumeBase: number
  profile: MarketProfile
}

export const STOCK_UNIVERSE: StockProfile[] = [
  { symbol: '600519', name: '贵州茅台', sector: '白酒消费', basePrice: 1688, volumeBase: 320_000, profile: 'up' },
  { symbol: '300750', name: '宁德时代', sector: '新能源', basePrice: 262, volumeBase: 2_100_000, profile: 'strong' },
  { symbol: '002594', name: '比亚迪', sector: '汽车整车', basePrice: 318, volumeBase: 1_400_000, profile: 'strong' },
  { symbol: '601318', name: '中国平安', sector: '保险金融', basePrice: 48.6, volumeBase: 5_600_000, profile: 'range' },
  { symbol: '600036', name: '招商银行', sector: '银行', basePrice: 36.4, volumeBase: 4_800_000, profile: 'up' },
  { symbol: '000858', name: '五粮液', sector: '白酒消费', basePrice: 142, volumeBase: 900_000, profile: 'pullback' },
  { symbol: '002415', name: '海康威视', sector: '电子安防', basePrice: 31.2, volumeBase: 2_600_000, profile: 'pullback' },
  { symbol: '601899', name: '紫金矿业', sector: '有色金属', basePrice: 17.8, volumeBase: 9_800_000, profile: 'strong' },
  { symbol: '000001', name: '平安银行', sector: '银行', basePrice: 11.4, volumeBase: 12_000_000, profile: 'down' },
  { symbol: '002304', name: '洋河股份', sector: '白酒消费', basePrice: 88.5, volumeBase: 700_000, profile: 'down' },
]

export const DEFAULT_SYMBOLS: string[] = STOCK_UNIVERSE.map((s) => s.symbol)

export function findProfile(symbol: string): StockProfile | undefined {
  return STOCK_UNIVERSE.find((s) => s.symbol === symbol)
}

export function findProfileByName(name: string): StockProfile | undefined {
  return STOCK_UNIVERSE.find((s) => s.name === name)
}
