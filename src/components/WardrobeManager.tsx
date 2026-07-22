import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Shirt, Edit, Trash2, Tag, Sparkles, Loader2, CheckCircle, AlertCircle, Wand2, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { useBehaviorAnalytics } from '@/hooks/useBehaviorAnalytics';
import { useAIItemCategorization } from '@/hooks/useAIItemCategorization';
import { ImageProcessor } from '@/utils/imageProcessing';

interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  color?: string;
  brand?: string;
  size?: string;
  image_url?: string;
  tags?: string[];
  notes?: string;
}

const WardrobeManager = () => {
  const navigate = useNavigate();
  const [wardrobeItems, setWardrobeItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    name: '',
    category: '',
    color: '',
    brand: '',
    size: '',
    notes: ''
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [autoFillDone, setAutoFillDone] = useState(false);
  const [missingFields, setMissingFields] = useState<Set<string>>(new Set());
  const { trackEvent } = useBehaviorAnalytics();
  const { categorizeFromImageData, isAnalyzing } = useAIItemCategorization();

  const categories = [
    'Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Shoes', 
    'Accessories', 'Activewear', 'Formal', 'Undergarments'
  ];

  useEffect(() => {
    fetchWardrobeItems();
  }, []);

  const fetchWardrobeItems = async () => {
    try {
      const { data, error } = await supabase
        .from('wardrobe_items')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setWardrobeItems(data || []);
      
      // Track wardrobe view event
      trackEvent({
        event_type: 'wardrobe_view',
        event_data: { items_count: data?.length || 0 }
      });
    } catch (error) {
      console.error('Error fetching wardrobe items:', error);
      toast.error('Failed to load wardrobe items');
    } finally {
      setLoading(false);
    }
  };

  const CATEGORY_MAP: { [key: string]: string } = {
    'Tops': 'Tops', 'Bottoms': 'Bottoms', 'Dresses': 'Dresses', 'Outerwear': 'Outerwear',
    'Shoes': 'Shoes', 'Accessories': 'Accessories', 'Activewear': 'Activewear',
    'Formal': 'Formal', 'Undergarments': 'Undergarments',
    'top': 'Tops', 'bottom': 'Bottoms', 'dress': 'Dresses', 'outerwear': 'Outerwear',
    'shoes': 'Shoes', 'accessory': 'Accessories',
  };

  const stripHex = (s: string) => (s && !s.startsWith('#') ? s : '');

  const buildItemName = (color: string, subcategory: string | undefined, category: string) => {
    const cat = subcategory || (category ? category.replace(/s$/, '') : '');
    const parts = [color, cat].filter(Boolean).map(p => p.trim()).filter(Boolean);
    return parts.join(' ');
  };

  const handlePhotoSelected = async (file: File) => {
    setIsAutoFilling(true);
    setAutoFillDone(false);
    setMissingFields(new Set());
    try {
      // Show preview immediately
      const previewReader = new FileReader();
      previewReader.onload = () => setPhotoPreview(previewReader.result as string);
      previewReader.readAsDataURL(file);

      // Silent compression + colour extraction (no UI)
      const processed = await ImageProcessor.processImage(file, {
        compress: true,
        extractColors: true,
        removeBackground: false,
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
      });
      const finalBlob = processed.compressedBlob || processed.originalBlob;
      setPhotoBlob(finalBlob);

      // Convert to base64 for AI
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve((r.result as string).split(',')[1]);
        r.onerror = reject;
        r.readAsDataURL(finalBlob);
      });

      const result = await categorizeFromImageData(
        base64,
        processed.dominantColor,
        processed.colors,
      );

      const missing = new Set<string>();
      if (result) {
        const colorWord = stripHex(result.colors?.[0] || '');
        const mappedCategory = CATEGORY_MAP[result.category] || result.category || '';
        const derivedName = buildItemName(colorWord, result.subcategory, mappedCategory);
        const brand = result.suggestedBrand || '';
        const notes = (result.tags && result.tags.length > 0) ? result.tags.join(', ') : '';

        if (!derivedName) missing.add('name');
        if (!mappedCategory) missing.add('category');
        if (!colorWord) missing.add('color');
        if (!brand) missing.add('brand');

        setNewItem(prev => ({
          ...prev,
          name: derivedName || prev.name,
          category: mappedCategory || prev.category,
          color: colorWord || prev.color,
          brand: brand || prev.brand,
          notes: notes || prev.notes,
        }));
      } else {
        missing.add('name'); missing.add('category'); missing.add('color'); missing.add('brand');
      }
      setMissingFields(missing);
      setAutoFillDone(true);
    } catch (err) {
      console.error('Auto-fill failed:', err);
      toast.error('Could not auto-detect details — please fill them in');
      setMissingFields(new Set(['name', 'category', 'color', 'brand']));
      setAutoFillDone(true);
    } finally {
      setIsAutoFilling(false);
    }
  };

  const resetForm = () => {
    setNewItem({ name: '', category: '', color: '', brand: '', size: '', notes: '' });
    setPhotoPreview(null);
    setPhotoBlob(null);
    setIsAutoFilling(false);
    setAutoFillDone(false);
    setMissingFields(new Set());
    setEditingItemId(null);
  };

  const handleEditItem = (item: WardrobeItem) => {
    setEditingItemId(item.id);
    setNewItem({
      name: item.name || '',
      category: item.category || '',
      color: item.color || '',
      brand: item.brand || '',
      size: item.size || '',
      notes: (item.tags && item.tags.length > 0 ? item.tags.join(', ') : (item.notes || '')),
    });
    setPhotoPreview(item.image_url || null);
    setPhotoBlob(null);
    setAutoFillDone(false);
    setMissingFields(new Set());
    setShowAddForm(true);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (editingItemId) {
        const { error } = await supabase
          .from('wardrobe_items')
          .update({
            ...newItem,
            tags: newItem.notes ? [newItem.notes] : [],
          })
          .eq('id', editingItemId);

        if (error) throw error;

        toast.success('Item updated');
        resetForm();
        setShowAddForm(false);
        fetchWardrobeItems();
        return;
      }

      const { error } = await supabase
        .from('wardrobe_items')
        .insert({
          ...newItem,
          user_id: user.id,
          tags: newItem.notes ? [newItem.notes] : []
        });

      if (error) throw error;

      toast.success('Item added to wardrobe!');
      resetForm();
      setShowAddForm(false);
      fetchWardrobeItems();
      
      // Track item addition
      trackEvent({
        event_type: 'wardrobe_item_add',
        event_data: { 
          category: newItem.category,
          brand: newItem.brand,
          has_color: !!newItem.color,
          has_size: !!newItem.size
        }
      });
    } catch (error) {
      console.error('Error adding item:', error);
      toast.error(editingItemId ? 'Failed to update item' : 'Failed to add item to wardrobe');
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      const itemToDelete = wardrobeItems.find(item => item.id === id);
      
      const { error } = await supabase
        .from('wardrobe_items')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Item removed from wardrobe');
      fetchWardrobeItems();
      
      // Track item deletion
      if (itemToDelete) {
        trackEvent({
          event_type: 'wardrobe_item_delete',
          event_data: { 
            category: itemToDelete.category,
            brand: itemToDelete.brand
          }
        });
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Failed to remove item');
    }
  };

  const getCategoryIcon = (category: string) => {
    return <Shirt className="h-4 w-4" />;
  };

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      'Tops': 'bg-blue-100 text-blue-800',
      'Bottoms': 'bg-green-100 text-green-800',
      'Dresses': 'bg-pink-100 text-pink-800',
      'Outerwear': 'bg-purple-100 text-purple-800',
      'Shoes': 'bg-yellow-100 text-yellow-800',
      'Accessories': 'bg-red-100 text-red-800',
      'Activewear': 'bg-orange-100 text-orange-800',
      'Formal': 'bg-gray-100 text-gray-800',
      'Undergarments': 'bg-indigo-100 text-indigo-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="card-elegant p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary/20 border-t-primary mx-auto mb-4"></div>
          <h3 className="text-lg font-medium gradient-text mb-2">Loading your wardrobe...</h3>
          <p className="text-muted-foreground">Organizing your clothing items and generating recommendations</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">My Wardrobe</h2>
        <Button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Add New Item
              <Badge variant="secondary" className="ml-auto">
                <Sparkles className="h-3 w-3 mr-1" />
                AI Powered
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddItem} className="space-y-6">
              {/* Photo picker */}
              <div className="rounded-lg border border-dashed p-4">
                {!photoPreview ? (
                  <label className="flex flex-col items-center justify-center gap-2 cursor-pointer py-6 text-center">
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium">Add a photo</span>
                    <span className="text-xs text-muted-foreground">
                      We'll auto-fill the details — you can edit anything before saving.
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePhotoSelected(f);
                      }}
                    />
                  </label>
                ) : (
                  <div className="flex gap-4 items-start">
                    <img
                      src={photoPreview}
                      alt="Item"
                      className="w-24 h-24 object-cover rounded-md border"
                    />
                    <div className="flex-1 text-sm">
                      {(isAutoFilling || isAnalyzing) && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Reading your photo…</span>
                        </div>
                      )}
                      {autoFillDone && !isAnalyzing && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                          <span>Auto-filled — review below and edit anything.</span>
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="mt-2 px-0 h-auto text-xs"
                        onClick={() => {
                          setPhotoPreview(null);
                          setPhotoBlob(null);
                          setAutoFillDone(false);
                          setMissingFields(new Set());
                        }}
                      >
                        Replace photo
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Item Name *</label>
                  <Input
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="e.g., Black slip dress"
                    required
                  />
                  {autoFillDone && missingFields.has('name') && (
                    <p className="text-xs text-muted-foreground mt-1">Couldn't auto-detect — please add.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Category *</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500"
                    required
                  >
                    <option value="">Select category</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  {autoFillDone && missingFields.has('category') && (
                    <p className="text-xs text-muted-foreground mt-1">Couldn't auto-detect — please pick one.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Brand</label>
                  <Input
                    value={newItem.brand}
                    onChange={(e) => setNewItem({ ...newItem, brand: e.target.value })}
                    placeholder="e.g., Nike, Zara"
                  />
                  {autoFillDone && missingFields.has('brand') && (
                    <p className="text-xs text-muted-foreground mt-1">Couldn't auto-detect.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Colour</label>
                  <Input
                    value={newItem.color}
                    onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
                    placeholder="e.g., black"
                  />
                  {autoFillDone && missingFields.has('color') && (
                    <p className="text-xs text-muted-foreground mt-1">Couldn't auto-detect.</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Size</label>
                  <Input
                    value={newItem.size}
                    onChange={(e) => setNewItem({ ...newItem, size: e.target.value })}
                    placeholder="e.g., M, 8, 32"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Notes</label>
                  <Input
                    value={newItem.notes}
                    onChange={(e) => setNewItem({ ...newItem, notes: e.target.value })}
                    placeholder="Any additional notes"
                  />
                </div>
              </div>


              <div className="flex gap-2">
                <Button type="submit" className="bg-gradient-to-r from-rose-500 to-pink-600">
                  Add to Wardrobe
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowAddForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {wardrobeItems.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <Shirt className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Your wardrobe is empty</h3>
            <p className="text-gray-500 mb-4">Start building your digital wardrobe by adding your favourite pieces!</p>
            <Button
              onClick={() => setShowAddForm(true)}
              className="bg-gradient-to-r from-rose-500 to-pink-600"
            >
              Add Your First Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {wardrobeItems.map((item) => (
            <Card key={item.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {getCategoryIcon(item.category)}
                    <h3 className="font-semibold text-gray-800 truncate">{item.name}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteItem(item.id)}
                    className="text-gray-400 hover:text-red-500 h-6 w-6 p-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <Badge className={getCategoryColor(item.category)}>
                    {item.category}
                  </Badge>
                  
                  <div className="text-sm text-gray-600 space-y-1">
                    {item.brand && <p><strong>Brand:</strong> {item.brand}</p>}
                    {item.color && <p><strong>Color:</strong> {item.color}</p>}
                    {item.size && <p><strong>Size:</strong> {item.size}</p>}
                    {item.notes && <p><strong>Notes:</strong> {item.notes}</p>}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2"
                    onClick={() =>
                      navigate('/app', {
                        state: { anchorItemId: item.id, anchorItemName: item.name },
                      })
                    }
                  >
                    <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                    Style this
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default WardrobeManager;
