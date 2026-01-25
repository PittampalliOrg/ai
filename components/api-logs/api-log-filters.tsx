"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Filter, X } from "lucide-react";
import type { ApiLogFilters } from "@/lib/types/diagrid-services";

interface ApiLogFiltersProps {
  filters: ApiLogFilters;
  onFiltersChange: (filters: Partial<ApiLogFilters>) => void;
  onClear: () => void;
  availableAppIds: string[];
  availableApis: string[];
}

export function ApiLogFiltersDropdown({
  filters,
  onFiltersChange,
  onClear,
  availableAppIds,
  availableApis,
}: ApiLogFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<ApiLogFilters>(filters);

  const hasActiveFilters =
    filters.appIds.length > 0 ||
    filters.status.length > 0 ||
    filters.daprApi.length > 0 ||
    filters.dateFrom ||
    filters.dateTo;

  const handleAppIdToggle = (appId: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      appIds: prev.appIds.includes(appId)
        ? prev.appIds.filter((id) => id !== appId)
        : [...prev.appIds, appId],
    }));
  };

  const handleStatusToggle = (status: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter((s) => s !== status)
        : [...prev.status, status],
    }));
  };

  const handleApiToggle = (api: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      daprApi: prev.daprApi.includes(api)
        ? prev.daprApi.filter((a) => a !== api)
        : [...prev.daprApi, api],
    }));
  };

  const handleApply = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalFilters({
      appIds: [],
      status: [],
      daprApi: [],
      dateFrom: undefined,
      dateTo: undefined,
    });
    onClear();
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`gap-2 border-gray-600 bg-transparent hover:bg-[#252c3d] ${
            hasActiveFilters ? "text-cyan-400 border-cyan-400/50" : "text-gray-400"
          }`}
        >
          <Filter className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-1 rounded-full bg-cyan-400/20 px-1.5 py-0.5 text-xs">
              {filters.appIds.length +
                filters.status.length +
                filters.daprApi.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 bg-[#1e2433] border-gray-700 p-4"
        align="start"
      >
        <div className="space-y-4">
          {/* App IDs */}
          <div>
            <Label className="text-sm text-gray-400 mb-2 block">App IDs</Label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {availableAppIds.map((appId) => (
                <div key={appId} className="flex items-center gap-2">
                  <Checkbox
                    id={`app-${appId}`}
                    checked={localFilters.appIds.includes(appId)}
                    onCheckedChange={() => handleAppIdToggle(appId)}
                  />
                  <label
                    htmlFor={`app-${appId}`}
                    className="text-sm text-gray-300 cursor-pointer"
                  >
                    {appId}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-sm text-gray-400 mb-2 block">Status</Label>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="status-ok"
                  checked={localFilters.status.includes("OK")}
                  onCheckedChange={() => handleStatusToggle("OK")}
                />
                <label
                  htmlFor="status-ok"
                  className="text-sm text-green-400 cursor-pointer"
                >
                  OK
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="status-error"
                  checked={localFilters.status.includes("ERROR")}
                  onCheckedChange={() => handleStatusToggle("ERROR")}
                />
                <label
                  htmlFor="status-error"
                  className="text-sm text-red-400 cursor-pointer"
                >
                  ERROR
                </label>
              </div>
            </div>
          </div>

          {/* Dapr API */}
          <div>
            <Label className="text-sm text-gray-400 mb-2 block">Dapr API</Label>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {availableApis.map((api) => (
                <div key={api} className="flex items-center gap-2">
                  <Checkbox
                    id={`api-${api}`}
                    checked={localFilters.daprApi.includes(api)}
                    onCheckedChange={() => handleApiToggle(api)}
                  />
                  <label
                    htmlFor={`api-${api}`}
                    className="text-sm text-gray-300 cursor-pointer"
                  >
                    {api}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-sm text-gray-400 mb-2 block">From</Label>
              <Input
                type="datetime-local"
                value={localFilters.dateFrom || ""}
                onChange={(e) =>
                  setLocalFilters((prev) => ({
                    ...prev,
                    dateFrom: e.target.value || undefined,
                  }))
                }
                className="bg-transparent border-gray-600 text-sm"
              />
            </div>
            <div>
              <Label className="text-sm text-gray-400 mb-2 block">To</Label>
              <Input
                type="datetime-local"
                value={localFilters.dateTo || ""}
                onChange={(e) =>
                  setLocalFilters((prev) => ({
                    ...prev,
                    dateTo: e.target.value || undefined,
                  }))
                }
                className="bg-transparent border-gray-600 text-sm"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-2 border-t border-gray-700">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-gray-400 hover:text-white"
            >
              Clear all
            </Button>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                className="bg-cyan-500 hover:bg-cyan-600 text-white"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
