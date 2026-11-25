type Message = { id: string; defaultMessage?: string };
type Label = string | { props: Message };
type FormatMessage = (message: Message) => string;

interface SearchableEntry {
  name?: Label;
  description?: Label;
  deviceId?: string;
  extensionId?: string;
  tags?: readonly string[];
  sku?: string | number;
}

export function libraryLabel(label: Label | undefined, formatMessage: FormatMessage) {
  if (typeof label === 'string') return label;
  return label?.props?.id ? formatMessage(label.props) : '';
}

export function matchesLibraryKeyword(item: SearchableEntry, query: string, formatMessage: FormatMessage) {
  const needle = query.toLowerCase();
  return [libraryLabel(item.name, formatMessage), libraryLabel(item.description, formatMessage), item.deviceId,
    item.extensionId, item.sku?.toString(), ...(item.tags ?? [])].some(field => field?.toLowerCase().includes(needle));
}
