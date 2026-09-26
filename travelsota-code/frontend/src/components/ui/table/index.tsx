import type {
  FC,
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
}
interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}
interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}
interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
}
interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  isHeader?: boolean;
}
interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
}

const Table: FC<TableProps> = ({ children, className, ...props }) => {
  return <table className={`min-w-full ${className ?? ""}`} {...props}>{children}</table>;
};

const TableHeader: FC<TableHeaderProps> = ({ children, className, ...props }) => {
  return <thead className={className} {...props}>{children}</thead>;
};

const TableBody: FC<TableBodyProps> = ({ children, className, ...props }) => {
  return <tbody className={className} {...props}>{children}</tbody>;
};

const TableRow: FC<TableRowProps> = ({ children, className, ...props }) => {
  return <tr className={className} {...props}>{children}</tr>;
};

const TableHead: FC<TableHeadProps> = ({ children, className, ...props }) => {
  return <th className={className} {...props}>{children}</th>;
};

const TableCell: FC<TableCellProps> = ({ children, isHeader = false, className, ...props }) => {
  const CellTag = isHeader ? "th" : "td";
  return <CellTag className={className} {...props}>{children}</CellTag>;
};

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
