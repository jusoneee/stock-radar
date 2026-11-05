export interface LinePoint {
  label: string
  value: number | null
}

export interface LineSeries {
  id: string
  name: string
  color: string
  points: LinePoint[]
}
