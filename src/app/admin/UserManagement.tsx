"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminToaster } from "@/app/admin/AdminToaster";
import type { AdminUser } from "@/app/admin/actions";
import { deleteUser, updateUserRole } from "@/app/admin/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/shared/components/ConfirmDialog";

// DB の role 値（"admin" / "viewer"）を画面表示用の日本語ラベルに映射する
const ROLE_LABELS: Record<string, string> = {
  admin: "管理者",
  viewer: "閲覧者",
};

export function UserManagement({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateUserRole(userId, newRole);
      adminToaster.create({ title: "ロールを更新しました", type: "success" });
      router.refresh();
    } catch {
      adminToaster.create({
        title: "ロールの更新に失敗しました",
        type: "error",
      });
    }
  };

  const handleDeleteConfirm = async () => {
    const user = deletingUser;
    if (!user) {
      setDeleteDialogOpen(false);
      return;
    }
    try {
      await deleteUser(user.id);
      adminToaster.create({ title: "ユーザーを削除しました", type: "success" });
      router.refresh();
    } catch {
      adminToaster.create({
        title: "ユーザーの削除に失敗しました",
        type: "error",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingUser(null);
    }
  };

  const deletingUserLabel = deletingUser
    ? (deletingUser.email ?? deletingUser.name ?? "このユーザー")
    : "";

  return (
    <>
      <Card className="overflow-hidden shadow-lg border-gray-200">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="table-header-cell">名前</TableHead>
                <TableHead className="table-header-cell">
                  メールアドレス
                </TableHead>
                <TableHead className="table-header-cell">ロール</TableHead>
                <TableHead className="table-header-cell">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        {user.image && (
                          <Image
                            src={user.image}
                            alt=""
                            fill
                            sizes="24px"
                            className="rounded-full object-cover"
                          />
                        )}
                        {user.name && (
                          <AvatarFallback className="text-[0.6875rem]">
                            {user.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      {user.name || "-"}
                    </div>
                  </TableCell>
                  <TableCell>{user.email || "-"}</TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(value: string | null) => {
                        if (value) handleRoleChange(user.id, value);
                      }}
                      disabled={user.isEnvAdmin}
                    >
                      <SelectTrigger className="w-[120px]">
                        {/* 生の role 値（admin/viewer）ではなく日本語ラベルを表示する */}
                        <SelectValue>
                          {(value: string) => ROLE_LABELS[value] ?? value}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">閲覧者</SelectItem>
                        <SelectItem value="admin">管理者</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={user.isEnvAdmin}
                      onClick={() => {
                        setDeletingUser(user);
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      削除
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* 削除確認は全行で 1 つのダイアログを共有する
          （行ごとに AlertDialog を複製すると open state が全行に波及するため） */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="ユーザーの削除"
        description={`「${deletingUserLabel}」を削除してもよろしいですか？この操作は取り消せません。`}
        confirmLabel="削除する"
        onConfirm={handleDeleteConfirm}
      />
    </>
  );
}
