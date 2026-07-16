import { Empty, Table } from "antd";

const preferredColumns = [
  "m_strAccountID",
  "m_strInstrumentID",
  "m_strInstrumentName",
  "m_strInstrument",
  "m_strMarket",
  "m_strExchangeID",
  "m_strOrderSysID",
  "m_nOrderID",
  "m_strTradeID",
  "m_nVolume",
  "m_dPrice",
  "m_dAveragePrice",
  "m_dTradeAmount",
  "m_dAvailable",
  "m_dBalance",
  "m_dStockValue",
  "m_dOpenPrice",
  "m_strInsertDate",
  "m_strInsertTime",
  "m_eStatus",
];

function createColumns(rows, columnTitles = {}, onlyColumnTitles = false, valueRenderers = {}) {
  const keys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row ?? {}))),
  );
  const visibleKeys = onlyColumnTitles
    ? keys.filter((key) => Object.hasOwn(columnTitles, key))
    : keys;
  const ordered = [
    ...preferredColumns.filter((key) => visibleKeys.includes(key)),
    ...visibleKeys.filter((key) => !preferredColumns.includes(key)).slice(0, 12),
  ];

  return ordered.map((key) => ({
    title: columnTitles[key] ?? key.replace(/^m_/, ""),
    dataIndex: key,
    key,
    ellipsis: true,
    width: key.length > 16 ? 180 : 140,
    render: (value, row) => {
      if (value === null || value === undefined || value === "") return "-";
      return valueRenderers[key]?.(value, row) ?? String(value);
    },
  }));
}

export default function DataGrid({ rows, loading, columnTitles = {}, columns, onlyColumnTitles = false, valueRenderers = {} }) {
  const data = Array.isArray(rows) ? rows : rows ? [rows] : [];

  if (!loading && data.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <Table
      size="small"
      rowKey={(_, index) => index}
      loading={loading}
      columns={columns ?? createColumns(data, columnTitles, onlyColumnTitles, valueRenderers)}
      dataSource={data}
      scroll={{ x: true }}
      pagination={{ pageSize: 8, showSizeChanger: false }}
    />
  );
}
