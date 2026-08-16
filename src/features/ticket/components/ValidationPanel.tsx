"use client";

import { AlertTriangle, Check, RefreshCw, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ValidationIssue, ValidationReport } from "../types";

const CHECK_LABELS: Record<string, string> = {
  schema: "構造（JSON Schema）",
  taxonomy: "標準ラベル・データ規則",
  coverage: "根拠・網羅性",
};

const IssueList = ({
  issues,
  level,
}: {
  issues: ValidationIssue[];
  level: "error" | "warning";
}) => {
  const target = issues.filter(issue => issue.level === level);
  if (target.length === 0) return null;
  const isError = level === "error";
  return (
    <Alert
      variant={isError ? "destructive" : "default"}
      className={`border p-4 ${isError ? "bg-red-50 border-red-300" : "bg-orange-50 border-orange-300"}`}
    >
      <div className="flex items-center gap-2">
        <AlertTriangle
          size={17}
          className={isError ? "text-red-700" : "text-orange-900"}
        />
        <AlertTitle
          className={`text-sm font-bold ${isError ? "text-red-700" : "text-orange-900"}`}
        >
          {isError ? "エラー" : "警告"} {target.length}件
        </AlertTitle>
      </div>
      <AlertDescription className="mt-1 flex flex-col gap-2">
        {!isError && (
          <p className="text-xs text-orange-900">
            保存は可能ですが、人間の判断が必要な指摘です。
          </p>
        )}
        {target.map((issue, index) => (
          <Card
            // biome-ignore lint/suspicious/noArrayIndexKey: 検証スクリプトの出力順をそのまま出す。
            key={`${issue.check}-${index}`}
          >
            <CardContent className="p-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <Badge
                  variant={isError ? "destructive" : "secondary"}
                  className="text-[0.6875rem] font-bold"
                >
                  {CHECK_LABELS[issue.check] ?? issue.check}
                </Badge>
                <span className="text-[0.6875rem] font-mono text-gray-600">
                  {issue.path}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-gray-900">
                {issue.message}
              </p>
            </CardContent>
          </Card>
        ))}
      </AlertDescription>
    </Alert>
  );
};

export const ValidationPanel = ({
  report,
  localIssues,
  isPending,
  onRun,
}: {
  report: ValidationReport | null;
  /** 画面側でしか分からない指摘（ID重複・存在しない参照） */
  localIssues: string[];
  isPending: boolean;
  onRun: () => void;
}) => {
  const errorCount =
    report?.issues.filter(issue => issue.level === "error").length ?? 0;

  return (
    <div className="flex max-w-[1000px] flex-col gap-4 mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck size={19} />
            <CardTitle className="text-lg font-semibold">検証</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-[240px] flex-1">
              <p className="mt-2 text-xs leading-relaxed text-gray-600">
                collect-ski-lift-ticket-pricing Skill が持つ検証3本
                （validate-lift-ticket / check-taxonomy /
                check-lift-ticket-coverage）をそのまま実行します。
                構造とラベル体系の正本はSkill側にあるため、
                <span className="font-bold">
                  エラーが1件でもあると保存されません
                </span>
                。
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={onRun}
            >
              <RefreshCw size={15} />
              いま検証する
            </Button>
          </div>
        </CardContent>
      </Card>

      {localIssues.length > 0 && (
        <Alert variant="destructive" className="bg-red-50 border-red-300">
          <AlertTitle className="text-sm text-red-700">
            ID の不整合 {localIssues.length}件
          </AlertTitle>
          <AlertDescription className="mt-1 flex flex-col gap-1">
            {localIssues.map(issue => (
              <p key={issue} className="text-xs font-mono text-red-900">
                {issue}
              </p>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {report === null ? (
        <p className="text-sm text-gray-500">
          まだ検証していません。「いま検証する」を押すか、保存すると実行されます。
        </p>
      ) : report.failedToRun !== null ? (
        <Alert variant="destructive" className="bg-red-50 border-red-300">
          <AlertTitle className="text-sm text-red-700">
            検証を実行できませんでした
          </AlertTitle>
          <AlertDescription className="mt-1 text-xs whitespace-pre-wrap text-red-900">
            {report.failedToRun}
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {errorCount === 0 && (
            <Alert className="bg-green-50 border-green-300">
              <Check size={18} className="text-green-900" />
              <AlertTitle className="text-sm text-green-900">
                検証3本ともエラーはありません。
              </AlertTitle>
            </Alert>
          )}
          <IssueList issues={report.issues} level="error" />
          <IssueList issues={report.issues} level="warning" />
          <p className="text-[0.6875rem] text-gray-400">
            検証時刻: {report.checkedAt}
          </p>
        </>
      )}
    </div>
  );
};
