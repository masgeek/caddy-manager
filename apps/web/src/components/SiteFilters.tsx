interface SiteFilterOption {
  value: string;
  label: string;
}

interface SiteFiltersProps {
  domains: string[];
  routeIds: string[];
  servers: SiteFilterOption[];
  serverBlocks: string[];
  statuses: string[];
  values: {
    domain: string;
    serverId: string;
    serverBlock: string;
    status: string;
    routeId: string;
  };
  onChange: (filter: keyof SiteFiltersProps["values"], value: string) => void;
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: SiteFilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="form-select"
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value={`all-${id}`}>
          All {label.toLowerCase().replace("filter by ", "")}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}

function FilterSearch({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const listId = `${id}-options`;
  return (
    <>
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="form-control"
        list={listId}
        value={value}
        aria-label={label}
        placeholder="Route ID"
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </>
  );
}

export default function SiteFilters({
  domains,
  servers,
  serverBlocks,
  statuses,
  routeIds,
  values,
  onChange,
}: SiteFiltersProps) {
  const options = (items: string[]): SiteFilterOption[] =>
    items.map((item) => ({ value: item, label: item }));

  return (
    <div className="sites-filter-controls d-flex gap-2 justify-content-end">
      <FilterSearch
        id="site-route-id-filter"
        label="Filter by route ID"
        value={values.routeId}
        options={routeIds}
        onChange={(value) => onChange("routeId", value)}
      />
      <FilterSelect
        id="site-domain-filter"
        label="Filter by domain"
        value={values.domain || "all-site-domain-filter"}
        options={options(domains)}
        onChange={(value) =>
          onChange("domain", value === "all-site-domain-filter" ? "" : value)
        }
      />
      <FilterSelect
        id="site-server-id-filter"
        label="Filter by server"
        value={values.serverId || "all-site-server-id-filter"}
        options={servers}
        onChange={(value) =>
          onChange(
            "serverId",
            value === "all-site-server-id-filter" ? "" : value,
          )
        }
      />
      <FilterSelect
        id="site-server-filter"
        label="Filter by server block"
        value={values.serverBlock || "all-site-server-filter"}
        options={options(serverBlocks)}
        onChange={(value) =>
          onChange(
            "serverBlock",
            value === "all-site-server-filter" ? "" : value,
          )
        }
      />
      <FilterSelect
        id="site-status-filter"
        label="Filter by status"
        value={values.status || "all-site-status-filter"}
        options={options(statuses)}
        onChange={(value) =>
          onChange("status", value === "all-site-status-filter" ? "" : value)
        }
      />
    </div>
  );
}
