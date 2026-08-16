"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { adminToaster } from "@/app/admin/AdminToaster";
import type { AdminUser } from "@/app/admin/actions";
import { deleteUser, updateUserRole } from "@/app/admin/actions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

export function UserManagement({ users }: { users: AdminUser[] }) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

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
    const userId = deletingUserId;
    if (!userId) {
      setDeleteDialogOpen(false);
      return;
    }
    try {
      await deleteUser(userId);
      adminToaster.create({ title: "ユーザーを削除しました", type: "success" });
      router.refresh();
    } catch {
      adminToaster.create({
        title: "ユーザーの削除に失敗しました",
        type: "error",
      });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingUserId(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
    setDeletingUserId(null);
  };

  return (
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
                      {user.image && <AvatarImage src={user.image} alt="" />}
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
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="viewer">閲覧者</SelectItem>
                      <SelectItem value="admin">管理者</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <AlertDialog
                    open={deleteDialogOpen}
                    onOpenChange={(open: boolean) => {
                      if (!open) handleDeleteCancel();
                    }}
                  >
                    <AlertDialogTrigger
                      render={
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={user.isEnvAdmin}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          削除
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>ユーザーの削除</AlertDialogTitle>
                        <AlertDialogDescription>
                          このユーザーを削除してもよろしいですか？この操作は取り消せません。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel onClick={handleDeleteCancel}>
                          キャンセル
                        </AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={handleDeleteConfirm}
                        >
                          削除する
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
