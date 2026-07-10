import { Empty, Table } from "antd";

const preferredColumns = [
  "m_strAccountID",
  "m_strInstrumentID",
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

function createColumns(rows) {
  const keys = Array.from(
    new Set(rows.flatMap((row) => Object.keys(row ?? {}))),
  );
  const ordered = [
    ...preferredColumns.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !preferredColumns.includes(key)).slice(0, 12),
  ];

  return ordered.map((key) => ({
    title: key.replace(/^m_/, ""),
    dataIndex: key,
    key,
    ellipsis: true,
    width: key.length > 16 ? 180 : 140,
    render: (value) => (value === null || value === undefined || value === "" ? "-" : String(value)),
  }));
}

export default function DataGrid({ rows, loading }) {
  const data = Array.isArray(rows) ? rows : rows ? [rows] : [];

  if (!loading && data.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <Table
      size="small"
      rowKey={(_, index) => index}
      loading={loading}
      columns={createColumns(data)}
      dataSource={data}
      scroll={{ x: true }}
      pagination={{ pageSize: 8, showSizeChanger: false }}
    />
  );
}
