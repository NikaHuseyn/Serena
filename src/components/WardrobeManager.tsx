import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Shirt, Edit, Trash2, Tag, Sparkles, Loader2, CheckCircle, AlertCircle, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { useBehaviorAnalytics } from '@/hooks/useBehaviorAnalytics';
import { useAIItemCategorization } from '@/hooks/useAIItemCategorization';
import { EnhancedImageUpload } from '@/components/EnhancedImageUpload';

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
  const [newItem, setNewItem] = useState({
    name: '',
    category: '',
    color: '',
    brand: '',
    size: '',
    notes: ''
  });
  const [showImageUpload, setShowImageUpload] = useState(false);
  const [aiSuggestions, setAISuggestions] = useState<any>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const { trackEvent } = useBehaviorAnalytics();
  const { categorizeFromText, categorizeFromImageData, isAnalyzing, getConfidenceLevel, getConfidenceColor } = useAIItemCategorization();

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

  const handleAICategorization = async () => {
    if (!newItem.name.trim()) {
      toast.error('Please enter an item name before using AI categorization');
      return;
    }

    const result = await categorizeFromText(newItem.name, newItem.notes);
    if (result) {
      setAISuggestions(result);
      toast.success('AI categorization complete!');
    }
  };

  const handleImageCategorization = async (imageBase64: string, dominantColor?: string, colors?: string[]) => {
    const result = await categorizeFromImageData(
      imageBase64,
      dominantColor,
      colors,
      newItem.name,
      newItem.notes
    );
    
    if (result) {
      setAISuggestions(result);
      toast.success('Image analysis complete!');
    }
  };

  const applySuggestions = () => {
    if (!aiSuggestions) return;

    setNewItem(prev => ({
      ...prev,
      category: aiSuggestions.category,
      brand: aiSuggestions.suggestedBrand || prev.brand,
      color: aiSuggestions.colors.length > 0 ? aiSuggestions.colors.join(', ') : prev.color,
      notes: aiSuggestions.tags.length > 0 ? aiSuggestions.tags.join(', ') : prev.notes
    }));

    toast.success('AI suggestions applied!');
  };

  const resetForm = () => {
    setNewItem({ name: '', category: '', color: '', brand: '', size: '', notes: '' });
    setAISuggestions(null);
    setImageFile(null);
    setShowImageUpload(false);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

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
      toast.error('Failed to add item to wardrobe');
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
              {/* AI Categorization Section */}
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 border border-purple-100">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-800 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    AI Auto-Categorization
                  </h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowImageUpload(!showImageUpload)}
                  >
                    {showImageUpload ? 'Hide' : 'Add Image'}
                  </Button>
                </div>
                
                <div className="flex gap-2 mb-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAICategorization}
                    disabled={isAnalyzing || !newItem.name.trim()}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-3 w-3 mr-1" />
                    )}
                    Analyse Text
                  </Button>
                  
                  {aiSuggestions && (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={applySuggestions}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Apply Suggestions
                    </Button>
                  )}
                </div>

                {/* Image Upload Section */}
                {showImageUpload && (
                  <div className="mt-4 p-4 bg-white rounded-lg border">
                    <EnhancedImageUpload
                      onImageProcessed={(result) => {
                        if (result.dominantColor || result.colors) {
                          // Convert processed image to base64 for AI analysis
                          const reader = new FileReader();
                          reader.onload = () => {
                            const base64 = reader.result as string;
                            const imageBase64 = base64.split(',')[1]; // Remove data URL prefix
                            handleImageCategorization(imageBase64, result.dominantColor, result.colors);
                          };
                          reader.readAsDataURL(result.originalBlob);
                        }
                      }}
                      maxSize={5 * 1024 * 1024} // 5MB
                      showEditor={false}
                    />
                  </div>
                )}

                {/* AI Suggestions Display */}
                {aiSuggestions && (
                  <div className="mt-4 p-4 bg-white rounded-lg border space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-medium text-gray-800">AI Suggestions</h5>
                      <Badge className={getConfidenceColor(aiSuggestions.confidence)}>
                        {getConfidenceLevel(aiSuggestions.confidence)} Confidence
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <label className="font-medium text-gray-600">Category:</label>
                        <p className="text-gray-800">{aiSuggestions.category}</p>
                      </div>
                      {aiSuggestions.subcategory && (
                        <div>
                          <label className="font-medium text-gray-600">Type:</label>
                          <p className="text-gray-800">{aiSuggestions.subcategory}</p>
                        </div>
                      )}
                      {aiSuggestions.suggestedBrand && (
                        <div>
                          <label className="font-medium text-gray-600">Brand:</label>
                          <p className="text-gray-800">{aiSuggestions.suggestedBrand}</p>
                        </div>
                      )}
                      {aiSuggestions.colors.length > 0 && (
                        <div>
                          <label className="font-medium text-gray-600">Colors:</label>
                          <p className="text-gray-800">{aiSuggestions.colors.join(', ')}</p>
                        </div>
                      )}
                    </div>
                    
                    {aiSuggestions.tags.length > 0 && (
                      <div>
                        <label className="font-medium text-gray-600">Suggested Tags:</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {aiSuggestions.tags.map((tag: string, index: number) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="text-xs text-gray-600 italic">
                      {aiSuggestions.reasoning}
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
                    placeholder="e.g., Blue Cotton T-Shirt"
                    required
                  />
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
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Brand</label>
                  <Input
                    value={newItem.brand}
                    onChange={(e) => setNewItem({ ...newItem, brand: e.target.value })}
                    placeholder="e.g., Nike, Zara"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Color</label>
                  <Input
                    value={newItem.color}
                    onChange={(e) => setNewItem({ ...newItem, color: e.target.value })}
                    placeholder="e.g., Navy Blue"
                  />
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
                      navigate('/', {
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
