export type PrereqNode =
  | { type: 'course'; code: string }
  | { type: 'and'; children: PrereqNode[] }
  | { type: 'or'; children: PrereqNode[] }
  | { type: 'constraint'; detail: string; child: PrereqNode | null }

export type ParsePrereqResult =
  | { ok: true; ast: PrereqNode }
  | { ok: false; raw: string }
