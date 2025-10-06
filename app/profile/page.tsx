"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import EnableTwoFactor from "./EnableTwoFactor";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";

// Password rules
const passwordRules = [
  {
    label: "At least 8 characters",
    test: (v: string) => v.length >= 8,
  },
  {
    label: "At least one uppercase letter",
    test: (v: string) => /[A-Z]/.test(v),
  },
  {
    label: "At least one lowercase letter",
    test: (v: string) => /[a-z]/.test(v),
  },
  {
    label: "At least one special character",
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
  },
];

// Zod schema with all rules
const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .refine((v) => /[A-Z]/.test(v), {
        message: "Must contain an uppercase letter",
      })
      .refine((v) => /[a-z]/.test(v), {
        message: "Must contain a lowercase letter",
      })
      .refine((v) => /[^A-Za-z0-9]/.test(v), {
        message: "Must contain a special character",
      }),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"],
  });

export default function SettingsPage() {
  const [showEnable2FA, setShowEnable2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Watch newPassword for live checker
  const newPassword = form.watch("newPassword") || "";

  const handleChangePassword = async (values: z.infer<typeof passwordSchema>) => {
    setPasswordSuccess(null);
    try {
      setLoading(true);
      await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      setPasswordSuccess("Password changed successfully!");
      toast.success("Password changed successfully!");
      form.reset();
    } catch (err: any) {
      form.setError("currentPassword", {
        message: err?.message || "Failed to change password. Please try again.",
      });
      toast.error("Failed to change password. Please try again.");

    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      {showEnable2FA ? (
        <EnableTwoFactor />
      ) : (
        <div className="w-full max-w-md space-y-4">
          <Button
            variant="ghost"
            size="sm"
            className="flex items-center gap-2"
            asChild
          >
            <Link href="/dashboard">
              <ArrowLeft size={16} />
              Back to Dashboard
            </Link>
          </Button>
          <Card className="w-full">
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">Settings</CardTitle>
              <CardDescription className="text-xs md:text-sm">
                Manage your account settings and security
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              {/* 2FA Section */}
              <div className="grid gap-4">
                <div>
                  <h3 className="text-sm font-medium mb-1">
                    Two-Factor Authentication
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Add an extra layer of security to your account by requiring
                    a verification code in addition to your password.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setShowEnable2FA(true)}
                    disabled={loading}
                  >
                    Enable 2FA
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={async () => {
                      setLoading(true);
                      try {
                        await authClient.twoFactor.disable({ password: "" });
                      } catch {
                        alert("Failed to disable 2FA. Please try again.");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    disabled={loading}
                  >
                    Disable 2FA
                  </Button>
                </div>
              </div>

              {/* Change Password Section */}
              <div className="grid gap-4">
                <div>
                  <h3 className="text-sm font-medium mb-1 flex items-center gap-2">
                    Change Password
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Update your account password. Make sure your new password is
                    strong and secure.
                  </p>
                </div>
                <Form {...form}>
                  <form
                    className="space-y-2"
                    onSubmit={form.handleSubmit(handleChangePassword)}
                  >
                    <FormField
                      control={form.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Current password"
                              disabled={loading}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="New password"
                              disabled={loading}
                              {...field}
                            />
                          </FormControl>
                          <PasswordChecker password={newPassword} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm new password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Confirm new password"
                              disabled={loading}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {passwordSuccess && (
                      <div className="text-green-600 text-xs">
                        {passwordSuccess}
                      </div>
                    )}
                    <Button type="submit" disabled={loading} className="w-full">
                      Change Password
                    </Button>
                  </form>
                </Form>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// PasswordChecker component with motion
function PasswordChecker({ password }: { password: string }) {
  return (
    <div className="mt-2 space-y-1 text-xs">
      {passwordRules.map((rule, idx) => {
        const passed = rule.test(password);
        return (
          <motion.div
            key={rule.label}
            initial={false}
            animate={{
              color: passed ? "#22c55e" : "#ef4444",
              textDecoration: passed ? "line-through" : "none",
              opacity: passed ? 0.7 : 1,
            }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-1"
          >
            <span>{rule.label}</span>
          </motion.div>
        );
      })}
    </div>
  );
}
