"use client";

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Search, Package } from "lucide-react";

type ProductFormData = {
  name: string;
  parentAsin: string;
  brandId: number | null;
  category: string;
  productLine: string;
  basePrice: string;
  cogs: string;
  targetAcos: string;
  targetTacos: string;
  currentStage: "launch" | "growth" | "maintenance";
};

type VariationFormData = {
  childAsin: string;
  sku: string;
  price: string;
  size: string;
  color: string;
};

const emptyProductForm: ProductFormData = {
  name: "",
  parentAsin: "",
  brandId: null,
  category: "",
  productLine: "",
  basePrice: "",
  cogs: "",
  targetAcos: "",
  targetTacos: "",
  currentStage: "launch",
};

const emptyVariationForm: VariationFormData = {
  childAsin: "",
  sku: "",
  price: "",
  size: "",
  color: "",
};

function stageBadge(stage: string | null) {
  switch (stage) {
    case "launch":
      return <Badge variant="default" className="bg-blue-500/15 text-blue-700 dark:text-blue-400">Launch</Badge>;
    case "growth":
      return <Badge variant="default" className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">Growth</Badge>;
    case "maintenance":
      return <Badge variant="default" className="bg-green-500/15 text-green-700 dark:text-green-400">Maintenance</Badge>;
    default:
      return <Badge variant="secondary">{stage ?? "N/A"}</Badge>;
  }
}

function formatPercent(value: string | null): string {
  if (!value) return "-";
  const num = parseFloat(value);
  return isNaN(num) ? "-" : `${(num * 100).toFixed(1)}%`;
}

function formatCurrency(value: string | null): string {
  if (!value) return "-";
  const num = parseFloat(value);
  return isNaN(num) ? "-" : `$${num.toFixed(2)}`;
}

function calcBreakevenAcos(price: string, cogs: string): string {
  const p = parseFloat(price);
  const c = parseFloat(cogs);
  if (isNaN(p) || isNaN(c) || p === 0) return "";
  const estFees = p * 0.15;
  const be = (p - c - estFees) / p;
  return be > 0 ? be.toFixed(4) : "0";
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<number | null>(null);
  const [productForm, setProductForm] = useState<ProductFormData>(emptyProductForm);

  const [variationDialogOpen, setVariationDialogOpen] = useState(false);
  const [variationProductId, setVariationProductId] = useState<number | null>(null);
  const [variationForm, setVariationForm] = useState<VariationFormData>(emptyVariationForm);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data, refetch } = trpc.products.list.useQuery({
    page,
    pageSize: 25,
    search: search || undefined,
    sortBy: "createdAt",
    sortDir: "desc",
  });

  const { data: brandsData } = trpc.products.listBrands.useQuery();

  const { data: expandedProduct } = trpc.products.getById.useQuery(
    { id: expandedId! },
    { enabled: expandedId !== null }
  );

  const createMutation = trpc.products.create.useMutation({
    onSuccess: () => {
      refetch();
      setProductDialogOpen(false);
      setProductForm(emptyProductForm);
    },
  });

  const updateMutation = trpc.products.update.useMutation({
    onSuccess: () => {
      refetch();
      setProductDialogOpen(false);
      setProductForm(emptyProductForm);
      setEditingProduct(null);
    },
  });

  const deleteMutation = trpc.products.delete.useMutation({
    onSuccess: () => {
      refetch();
      setDeleteDialogOpen(false);
      setDeletingId(null);
    },
  });

  const addVariationMutation = trpc.products.addVariation.useMutation({
    onSuccess: () => {
      refetch();
      setVariationDialogOpen(false);
      setVariationForm(emptyVariationForm);
      setVariationProductId(null);
    },
  });

  const removeVariationMutation = trpc.products.removeVariation.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const breakevenAcos = useMemo(
    () => calcBreakevenAcos(productForm.basePrice, productForm.cogs),
    [productForm.basePrice, productForm.cogs]
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 25));

  function openCreateDialog() {
    setEditingProduct(null);
    setProductForm(emptyProductForm);
    setProductDialogOpen(true);
  }

  function openEditDialog(product: (typeof items)[number]) {
    setEditingProduct(product.id);
    setProductForm({
      name: product.name,
      parentAsin: product.parentAsin,
      brandId: product.brandId,
      category: product.category ?? "",
      productLine: product.productLine ?? "",
      basePrice: product.basePrice ?? "",
      cogs: product.cogs ?? "",
      targetAcos: product.targetAcos ? (parseFloat(product.targetAcos) * 100).toString() : "",
      targetTacos: product.targetTacos ? (parseFloat(product.targetTacos) * 100).toString() : "",
      currentStage: (product.currentStage as "launch" | "growth" | "maintenance") ?? "launch",
    });
    setProductDialogOpen(true);
  }

  function handleProductSubmit() {
    const payload = {
      name: productForm.name,
      parentAsin: productForm.parentAsin,
      brandId: productForm.brandId!,
      category: productForm.category || undefined,
      productLine: productForm.productLine || undefined,
      basePrice: productForm.basePrice || undefined,
      cogs: productForm.cogs || undefined,
      targetAcos: productForm.targetAcos
        ? (parseFloat(productForm.targetAcos) / 100).toFixed(4)
        : undefined,
      targetTacos: productForm.targetTacos
        ? (parseFloat(productForm.targetTacos) / 100).toFixed(4)
        : undefined,
      breakevenAcos: breakevenAcos || undefined,
      currentStage: productForm.currentStage,
    };

    if (editingProduct !== null) {
      updateMutation.mutate({ id: editingProduct, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleAddVariation() {
    if (!variationProductId) return;
    addVariationMutation.mutate({
      productId: variationProductId,
      childAsin: variationForm.childAsin,
      sku: variationForm.sku || undefined,
      price: variationForm.price || undefined,
      variationAttributes: {
        size: variationForm.size || undefined,
        color: variationForm.color || undefined,
      },
    });
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Product Management</CardTitle>
            <CardDescription>
              Manage your product catalog, assign brands, and configure ASIN groupings.
            </CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="size-4 mr-1" />
            Add Product
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Search bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or ASIN..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-8"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {total} product{total !== 1 ? "s" : ""}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Package className="size-12 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">No Products Found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search
                ? "No products match your search. Try a different query."
                : "Get started by adding your first product."}
            </p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Parent ASIN</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">COGS</TableHead>
                  <TableHead className="text-right">Target ACOS</TableHead>
                  <TableHead className="text-right">BE ACOS</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((product) => (
                  <>
                    <TableRow
                      key={product.id}
                      className="cursor-pointer"
                      onClick={() =>
                        setExpandedId(expandedId === product.id ? null : product.id)
                      }
                    >
                      <TableCell>
                        {expandedId === product.id ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {product.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {product.parentAsin}
                      </TableCell>
                      <TableCell>{product.brandName ?? "-"}</TableCell>
                      <TableCell>{stageBadge(product.currentStage)}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(product.basePrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(product.cogs)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPercent(product.targetAcos)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPercent(product.breakevenAcos)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => openEditDialog(product)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setDeletingId(product.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === product.id && (
                      <TableRow key={`${product.id}-expanded`}>
                        <TableCell colSpan={10} className="bg-muted/30 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium">Variations</h4>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setVariationProductId(product.id);
                                setVariationForm(emptyVariationForm);
                                setVariationDialogOpen(true);
                              }}
                            >
                              <Plus className="size-3.5 mr-1" />
                              Add Variation
                            </Button>
                          </div>
                          {expandedProduct?.variations &&
                          expandedProduct.variations.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Child ASIN</TableHead>
                                  <TableHead>SKU</TableHead>
                                  <TableHead>Attributes</TableHead>
                                  <TableHead className="text-right">Price</TableHead>
                                  <TableHead className="text-right w-16">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {expandedProduct.variations.map((v) => {
                                  const attrs = v.variationAttributes as {
                                    size?: string;
                                    color?: string;
                                  } | null;
                                  return (
                                    <TableRow key={v.id}>
                                      <TableCell className="font-mono text-xs">
                                        {v.childAsin}
                                      </TableCell>
                                      <TableCell>{v.sku ?? "-"}</TableCell>
                                      <TableCell>
                                        {[attrs?.size, attrs?.color]
                                          .filter(Boolean)
                                          .join(", ") || "-"}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        {formatCurrency(v.price)}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <Button
                                          variant="ghost"
                                          size="icon-xs"
                                          onClick={() =>
                                            removeVariationMutation.mutate({ id: v.id })
                                          }
                                        >
                                          <Trash2 className="size-3.5 text-destructive" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              No variations added yet.
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>

      {/* Product Create/Edit Dialog */}
      <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingProduct !== null ? "Edit Product" : "Add Product"}
            </DialogTitle>
            <DialogDescription>
              {editingProduct !== null
                ? "Update product details below."
                : "Fill in the details to add a new product."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-1.5">
              <Label htmlFor="prod-name">Name</Label>
              <Input
                id="prod-name"
                value={productForm.name}
                onChange={(e) =>
                  setProductForm({ ...productForm, name: e.target.value })
                }
                placeholder="Product name"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="prod-asin">Parent ASIN</Label>
                <Input
                  id="prod-asin"
                  value={productForm.parentAsin}
                  onChange={(e) =>
                    setProductForm({ ...productForm, parentAsin: e.target.value })
                  }
                  placeholder="B0XXXXXXXX"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Brand</Label>
                <Select
                  value={productForm.brandId?.toString() ?? ""}
                  onValueChange={(val) =>
                    setProductForm({ ...productForm, brandId: parseInt(val as string, 10) })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {(brandsData ?? []).map((b) => (
                      <SelectItem key={b.id} value={b.id.toString()}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="prod-category">Category</Label>
                <Input
                  id="prod-category"
                  value={productForm.category}
                  onChange={(e) =>
                    setProductForm({ ...productForm, category: e.target.value })
                  }
                  placeholder="Category"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="prod-line">Product Line</Label>
                <Input
                  id="prod-line"
                  value={productForm.productLine}
                  onChange={(e) =>
                    setProductForm({ ...productForm, productLine: e.target.value })
                  }
                  placeholder="Product line"
                />
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="prod-price">Base Price ($)</Label>
                <Input
                  id="prod-price"
                  type="number"
                  step="0.01"
                  value={productForm.basePrice}
                  onChange={(e) =>
                    setProductForm({ ...productForm, basePrice: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="prod-cogs">COGS ($)</Label>
                <Input
                  id="prod-cogs"
                  type="number"
                  step="0.01"
                  value={productForm.cogs}
                  onChange={(e) =>
                    setProductForm({ ...productForm, cogs: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="prod-tacos">Target ACOS (%)</Label>
                <Input
                  id="prod-tacos"
                  type="number"
                  step="0.1"
                  value={productForm.targetAcos}
                  onChange={(e) =>
                    setProductForm({ ...productForm, targetAcos: e.target.value })
                  }
                  placeholder="25.0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="prod-ttacos">Target TACOS (%)</Label>
                <Input
                  id="prod-ttacos"
                  type="number"
                  step="0.1"
                  value={productForm.targetTacos}
                  onChange={(e) =>
                    setProductForm({ ...productForm, targetTacos: e.target.value })
                  }
                  placeholder="10.0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Stage</Label>
                <Select
                  value={productForm.currentStage}
                  onValueChange={(val) =>
                    setProductForm({
                      ...productForm,
                      currentStage: val as "launch" | "growth" | "maintenance",
                    })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="launch">Launch</SelectItem>
                    <SelectItem value="growth">Growth</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Breakeven ACOS</Label>
                <Input
                  readOnly
                  value={
                    breakevenAcos
                      ? `${(parseFloat(breakevenAcos) * 100).toFixed(1)}%`
                      : "-"
                  }
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  Auto-calculated: (Price - COGS - 15% fees) / Price
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleProductSubmit}
              disabled={
                !productForm.name ||
                !productForm.parentAsin ||
                !productForm.brandId ||
                isSubmitting
              }
            >
              {isSubmitting
                ? "Saving..."
                : editingProduct !== null
                ? "Update Product"
                : "Create Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variation Dialog */}
      <Dialog open={variationDialogOpen} onOpenChange={setVariationDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Variation</DialogTitle>
            <DialogDescription>
              Add a child ASIN variation to this product.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="var-asin">Child ASIN</Label>
                <Input
                  id="var-asin"
                  value={variationForm.childAsin}
                  onChange={(e) =>
                    setVariationForm({ ...variationForm, childAsin: e.target.value })
                  }
                  placeholder="B0XXXXXXXX"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="var-sku">SKU</Label>
                <Input
                  id="var-sku"
                  value={variationForm.sku}
                  onChange={(e) =>
                    setVariationForm({ ...variationForm, sku: e.target.value })
                  }
                  placeholder="SKU-001"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="var-price">Price ($)</Label>
                <Input
                  id="var-price"
                  type="number"
                  step="0.01"
                  value={variationForm.price}
                  onChange={(e) =>
                    setVariationForm({ ...variationForm, price: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="var-size">Size</Label>
                <Input
                  id="var-size"
                  value={variationForm.size}
                  onChange={(e) =>
                    setVariationForm({ ...variationForm, size: e.target.value })
                  }
                  placeholder="Large"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="var-color">Color</Label>
                <Input
                  id="var-color"
                  value={variationForm.color}
                  onChange={(e) =>
                    setVariationForm({ ...variationForm, color: e.target.value })
                  }
                  placeholder="Red"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleAddVariation}
              disabled={!variationForm.childAsin || addVariationMutation.isPending}
            >
              {addVariationMutation.isPending ? "Adding..." : "Add Variation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this product? This will deactivate it
              and hide it from the product list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingId !== null) {
                  deleteMutation.mutate({ id: deletingId });
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
