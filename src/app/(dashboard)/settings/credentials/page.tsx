"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  KeyRound,
  Plus,
  TestTubeDiagonal,
  Trash2,
  Loader2,
} from "lucide-react";

const CREDENTIAL_TYPES = {
  amazon_ads: "Amazon Ads",
  sp_api: "SP-API",
  jungle_scout: "Jungle Scout",
  datadive: "DataDive",
  datarover: "DataRover",
  asin_insight: "ASIN Insight",
} as const;

type CredentialType = keyof typeof CREDENTIAL_TYPES;

const EXTERNAL_TOOLS: CredentialType[] = [
  "jungle_scout",
  "datadive",
  "datarover",
  "asin_insight",
];

function StatusBadge({ status }: { status: string | null }) {
  if (status === "success") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Connected</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <Badge variant="secondary">Not Tested</Badge>;
}

function TypeBadge({ type }: { type: string }) {
  const label = CREDENTIAL_TYPES[type as CredentialType] ?? type;
  return <Badge variant="outline">{label}</Badge>;
}

function formatDate(date: Date | string | null) {
  if (!date) return "Never";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface FormState {
  credentialType: CredentialType;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  profileId: string;
  marketplaceId: string;
  awsAccessKey: string;
  awsSecretKey: string;
  roleArn: string;
}

const EMPTY_FORM: FormState = {
  credentialType: "amazon_ads",
  clientId: "",
  clientSecret: "",
  refreshToken: "",
  profileId: "",
  marketplaceId: "",
  awsAccessKey: "",
  awsSecretKey: "",
  roleArn: "",
};

export default function CredentialsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: credentials, refetch, isLoading } = trpc.credentials.list.useQuery();

  const upsertMutation = trpc.credentials.upsert.useMutation({
    onSuccess: () => {
      refetch();
      setDialogOpen(false);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMutation = trpc.credentials.delete.useMutation({
    onSuccess: () => {
      refetch();
      setDeleteConfirmId(null);
    },
  });

  const testMutation = trpc.credentials.testConnection.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    upsertMutation.mutate({
      credentialType: form.credentialType,
      clientId: form.clientId,
      clientSecret: form.clientSecret,
      refreshToken: form.refreshToken || undefined,
      profileId: form.profileId || undefined,
      marketplaceId: form.marketplaceId || undefined,
      awsAccessKey: form.awsAccessKey || undefined,
      awsSecretKey: form.awsSecretKey || undefined,
      roleArn: form.roleArn || undefined,
    });
  }

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const isExternalTool = EXTERNAL_TOOLS.includes(form.credentialType);
  const isSpApi = form.credentialType === "sp_api";
  const isAmazonAds = form.credentialType === "amazon_ads";

  const hasCredentials = credentials && credentials.length > 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5" />
              API Credentials
            </CardTitle>
            <CardDescription>
              Manage your API credentials for Amazon Advertising, SP-API, and
              third-party tools.
            </CardDescription>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger
              render={
                <Button>
                  <Plus className="size-4" />
                  Add Credential
                </Button>
              }
            />
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add API Credential</DialogTitle>
                <DialogDescription>
                  Enter your API credentials. All secrets are encrypted at rest.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Credential Type</Label>
                  <Select
                    value={form.credentialType}
                    onValueChange={(val) =>
                      updateField("credentialType", val as CredentialType)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CREDENTIAL_TYPES).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                {isExternalTool ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="clientId">API Key</Label>
                      <Input
                        id="clientId"
                        type="password"
                        placeholder="Enter your API key"
                        value={form.clientId}
                        onChange={(e) => updateField("clientId", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientSecret">API Secret</Label>
                      <Input
                        id="clientSecret"
                        type="password"
                        placeholder="Enter your API secret"
                        value={form.clientSecret}
                        onChange={(e) =>
                          updateField("clientSecret", e.target.value)
                        }
                        required
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="clientId">Client ID</Label>
                      <Input
                        id="clientId"
                        type="password"
                        placeholder="amzn1.application-oa2-client...."
                        value={form.clientId}
                        onChange={(e) => updateField("clientId", e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="clientSecret">Client Secret</Label>
                      <Input
                        id="clientSecret"
                        type="password"
                        placeholder="Enter client secret"
                        value={form.clientSecret}
                        onChange={(e) =>
                          updateField("clientSecret", e.target.value)
                        }
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="refreshToken">Refresh Token</Label>
                      <Input
                        id="refreshToken"
                        type="password"
                        placeholder="Atzr|..."
                        value={form.refreshToken}
                        onChange={(e) =>
                          updateField("refreshToken", e.target.value)
                        }
                      />
                    </div>
                  </>
                )}

                {isAmazonAds && (
                  <div className="space-y-2">
                    <Label htmlFor="profileId">Profile ID</Label>
                    <Input
                      id="profileId"
                      placeholder="e.g. 1234567890"
                      value={form.profileId}
                      onChange={(e) => updateField("profileId", e.target.value)}
                    />
                  </div>
                )}

                {isSpApi && (
                  <>
                    <Separator />
                    <p className="text-sm font-medium text-muted-foreground">
                      AWS Credentials (SP-API)
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="awsAccessKey">AWS Access Key</Label>
                      <Input
                        id="awsAccessKey"
                        type="password"
                        placeholder="AKIA..."
                        value={form.awsAccessKey}
                        onChange={(e) =>
                          updateField("awsAccessKey", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="awsSecretKey">AWS Secret Key</Label>
                      <Input
                        id="awsSecretKey"
                        type="password"
                        placeholder="Enter AWS secret key"
                        value={form.awsSecretKey}
                        onChange={(e) =>
                          updateField("awsSecretKey", e.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="roleArn">Role ARN</Label>
                      <Input
                        id="roleArn"
                        placeholder="arn:aws:iam::..."
                        value={form.roleArn}
                        onChange={(e) => updateField("roleArn", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="marketplaceId">Marketplace ID</Label>
                      <Input
                        id="marketplaceId"
                        placeholder="e.g. ATVPDKIKX0DER (US)"
                        value={form.marketplaceId}
                        onChange={(e) =>
                          updateField("marketplaceId", e.target.value)
                        }
                      />
                    </div>
                  </>
                )}

                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={upsertMutation.isPending}
                  >
                    {upsertMutation.isPending && (
                      <Loader2 className="size-4 animate-spin" />
                    )}
                    Save Credential
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasCredentials ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <KeyRound className="size-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium">No Credentials Configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add your API credentials to start pulling campaign and product
                data.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Marketplace</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Tested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credentials.map((cred) => (
                  <TableRow key={cred.id}>
                    <TableCell>
                      <TypeBadge type={cred.credentialType} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {cred.clientId ?? "—"}
                    </TableCell>
                    <TableCell>
                      {cred.marketplaceId ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={cred.lastTestStatus} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(cred.lastTestedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={testMutation.isPending}
                          onClick={() => testMutation.mutate({ id: cred.id })}
                        >
                          {testMutation.isPending &&
                          testMutation.variables?.id === cred.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <TestTubeDiagonal className="size-3.5" />
                          )}
                          Test
                        </Button>

                        {deleteConfirmId === cred.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={deleteMutation.isPending}
                              onClick={() =>
                                deleteMutation.mutate({ id: cred.id })
                              }
                            >
                              {deleteMutation.isPending ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : null}
                              Confirm
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteConfirmId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(cred.id)}
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
