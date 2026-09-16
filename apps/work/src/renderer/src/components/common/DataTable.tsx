import { type ReactElement, type ReactNode } from "react";
import { Table } from "../ui/Table";

export function DataTable(props: {
  children: ReactNode;
  testId?: string;
  className?: string;
}): ReactElement {
  return (
    <Table data-testid={props.testId} className={props.className}>
      {props.children}
    </Table>
  );
}
